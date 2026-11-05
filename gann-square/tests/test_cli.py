import json
import re

from typer.testing import CliRunner

from gannsquare.cli import app

runner = CliRunner()


def invoke(*args):
    result = runner.invoke(app, list(args))
    assert result.exit_code == 0, result.output
    return result.output


def test_levels():
    out = invoke("levels", "100", "--every", "90")
    assert "121.00" in out and "81.00" in out and "144.00" in out


def test_levels_bad_scale():
    result = runner.invoke(app, ["levels", "100", "--scale", "7"])
    assert result.exit_code == 1


def test_where():
    out = invoke("where", "121")
    assert "cell 121" in out and "SW diagonal" in out
    out = invoke("where", "1234", "--start", "100")
    assert "cell 1,135" in out


def test_square_numbers_and_dates():
    out = invoke("square", "--end", "25")
    assert out.splitlines()[0].split() == ["13", "14", "15", "16", "17"]
    out = invoke("square", "--end", "9", "--dates", "2026-01-01")
    assert out.splitlines()[1].split() == ["1/2", "1/1", "1/6"]


def test_time():
    out = invoke("time", "2026-01-01", "--rings", "1")
    assert "2026-01-02" in out and "W cross" in out and "2026-01-09" in out


def test_render(tmp_path):
    path = tmp_path / "sq.html"
    invoke(
        "render",
        "-o",
        str(path),
        "--start",
        "100",
        "--end",
        "5000",
        "--dates",
        "2026-01-02",
        "--unit",
        "trading",
    )
    html = path.read_text(encoding="utf-8")
    assert html.startswith("<!doctype html>")
    init = json.loads(
        re.search(r'<script id="gann-init" type="application/json">(.*?)</script>', html).group(1)
    )
    assert init == {
        "start": 100.0,
        "end": 5000.0,
        "mode": "date",
        "startDate": "2026-01-02",
        "unit": "trading",
    }


def test_square_with_trend():
    out = invoke("square", "--end", "49", "--mark", "9", "--trend", "up")
    assert out.splitlines()[0].split()[0] == "31"
    result = runner.invoke(app, ["square", "--end", "49", "--trend", "up"])
    assert result.exit_code == 1
    result = runner.invoke(app, ["square", "--end", "49", "--mark", "9", "--trend", "sideways"])
    assert result.exit_code == 1

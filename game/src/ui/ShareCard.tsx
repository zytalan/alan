import { useEffect, useState } from "react";
import { country, countryName, lifeCode, localUnitsReadable, pct, usd, wageYears, type LifeState, type Report } from "../engine";
import { formatMult } from "./charts";
import { currencySymbol, METALS, metalFor, type Metal } from "./Coin";
import { binOf } from "./LifeStrip";

// A finished life as a picture to keep or post. Like the coin, the card is an object,
// so it keeps the light colours in both themes.
const W = 1200;
const H = 630;
const INK = "#13241d";
const INK_2 = "#3f5249";
const MUTED = "#5b6d64";
const RULE = "#d2ddd6";
const SHEET = "#f7faf8";
const PAPER = "#edf2ee";
const STAMP = "#a8241c";
const WEALTH: Record<string, string> = {
  "--w-neg2": "#b3302f",
  "--w-neg1": "#eda7a5",
  "--w-mid": "#dfe6e1",
  "--w-pos1": "#b7d3f6",
  "--w-pos2": "#6da7ec",
  "--w-pos3": "#2a78d6",
  "--w-pos4": "#104281",
};
const DISPLAY = '"Gloock", Georgia, serif';
const BODY = '"Public Sans", "Segoe UI", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

/** The text that fits `width`, shrinking the font from `size` down to `min`. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, min: number, width: number): number {
  let px = size;
  for (; px > min; px -= 2) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = font(px);
  return px;
}

function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, metal: Metal, legend: string, symbol: string, age: number): void {
  const m = METALS[metal];
  const k = d / 120;
  ctx.save();
  ctx.translate(cx - 60 * k, cy - 60 * k);
  ctx.scale(k, k);
  ctx.fillStyle = m.lo;
  ctx.beginPath();
  ctx.arc(60, 60, 59, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = m.edge;
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(60 + 55 * Math.cos(a), 60 + 55 * Math.sin(a));
    ctx.lineTo(60 + 58.6 * Math.cos(a), 60 + 58.6 * Math.sin(a));
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(43, 36, 0, 43, 36, 94);
  g.addColorStop(0, m.hi);
  g.addColorStop(0.55, m.base);
  g.addColorStop(1, m.lo);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(60, 60, 54.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = m.ink;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(60, 60, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // the legend runs round the rim, starting at the left
  ctx.fillStyle = m.ink;
  ctx.font = `600 7px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let a = Math.PI + 0.02 * Math.PI * 2;
  for (const ch of legend.toUpperCase()) {
    const step = (ctx.measureText(ch).width + 1.4) / 47;
    ctx.save();
    ctx.translate(60 + 47 * Math.cos(a + step / 2), 60 + 47 * Math.sin(a + step / 2));
    ctx.rotate(a + step / 2 + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += step;
    if (a > Math.PI * 3 - 0.1) break;
  }
  const sym = symbol.length <= 1 ? 38 : symbol.length === 2 ? 28 : 18;
  ctx.font = `${sym}px ${DISPLAY}`;
  ctx.fillText(symbol, 60, 60 + sym * 0.25);
  ctx.font = `600 7.5px ${MONO}`;
  ctx.fillText(`AGE ${age}`, 60, 86);
  ctx.restore();
}

function drawStamp(ctx: CanvasRenderingContext2D, x: number, y: number, grade: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  ctx.strokeStyle = STAMP;
  ctx.fillStyle = STAMP;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = `64px ${DISPLAY}`;
  ctx.fillText(grade, 0, 18);
  ctx.font = `600 13px ${BODY}`;
  ctx.fillText("CHOICES", 0, 40);
  ctx.restore();
}

/** Draw the card for a finished life. */
export async function drawCard(s: LifeState, r: Report): Promise<HTMLCanvasElement> {
  try {
    await Promise.race([
      Promise.all([`64px ${DISPLAY}`, `600 16px ${BODY}`, `600 16px ${MONO}`].map((f) => document.fonts.load(f))),
      new Promise((done) => setTimeout(done, 2500)),
    ]);
  } catch {
    // system fonts will do
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = SHEET;
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(24, 24, W - 48, H - 48, 10);
  ctx.fill();
  ctx.stroke();

  const left = 64;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED;
  ctx.font = `600 15px ${BODY}`;
  ctx.fillText("LOT IN LIFE  ·  STATEMENT OF A LIFE", left, 72);

  // the coin at its best, as on the statement
  const peak = s.history.reduce((b, h) => Math.max(b, wageYears(s, h.netWorth, h.year, h.country)), 0);
  const symbol = localUnitsReadable(s) ? currencySymbol(country(s.country).cur) : "$";
  drawCoin(ctx, left + 110, 220, 220, metalFor(peak), `${r.name} · ${countryName(s.birthCountry)} · ${r.birthYear}–${r.deathYear} ·`, symbol, r.age);

  const tx = left + 260;
  const textW = W - tx - 220;
  ctx.fillStyle = INK;
  fit(ctx, r.name, (px) => `${px}px ${DISPLAY}`, 56, 30, textW);
  ctx.fillText(r.name, tx, 150);
  ctx.fillStyle = INK_2;
  const moved = s.country !== s.birthCountry ? ` → ${countryName(s.country)}` : "";
  const line = `${countryName(s.birthCountry)}${moved}, ${r.birthYear}–${r.deathYear} · died at ${r.age}`;
  fit(ctx, line, (px) => `${px}px ${BODY}`, 22, 14, textW);
  ctx.fillText(line, tx, 188);

  ctx.fillStyle = MUTED;
  ctx.font = `600 14px ${BODY}`;
  ctx.fillText("PEAK WEALTH, IN TODAY'S US DOLLARS", tx, 248);
  ctx.fillStyle = INK;
  ctx.font = `72px ${DISPLAY}`;
  ctx.fillText(usd(r.peakUsd), tx, 318);
  ctx.fillStyle = INK_2;
  const beat = r.worldPct >= 0.999 ? "99.9%" : pct(r.worldPct);
  const richer = `Richer over a lifetime than ${beat} of people born in ${r.birthYear}`;
  fit(ctx, richer, (px) => `${px}px ${BODY}`, 20, 14, textW + 160);
  ctx.fillText(richer, tx, 356);
  drawStamp(ctx, W - 150, 200, r.grade);

  // every year, coloured by wealth in years of a typical wage
  const cells = s.history;
  const sx = left;
  const sw = W - 2 * left;
  const sy = 410;
  const sh = 46;
  if (cells.length) {
    const gap = cells.length > 70 ? 1 : 2;
    const cw = (sw - gap * (cells.length - 1)) / cells.length;
    cells.forEach((h, i) => {
      ctx.fillStyle = WEALTH[binOf(wageYears(s, h.netWorth, h.year, h.country)).token];
      ctx.fillRect(sx + i * (cw + gap), sy, cw, sh);
    });
    ctx.fillStyle = MUTED;
    ctx.font = `600 15px ${MONO}`;
    ctx.fillText(String(cells[0].year), sx, sy + sh + 24);
    ctx.textAlign = "right";
    ctx.fillText(String(cells[cells.length - 1].year), sx + sw, sy + sh + 24);
    ctx.textAlign = "left";
  }

  // how much was luck
  ctx.fillStyle = INK;
  ctx.font = `600 20px ${BODY}`;
  const parts = [`Birth ${formatMult(r.luck.country)}`, `Fortune ${formatMult(r.luck.family)}`, `Choices ${formatMult(r.luck.choices)}`];
  ctx.fillText(parts.join("     "), left, H - 64);
  ctx.fillStyle = MUTED;
  ctx.font = `600 15px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText(`Life code ${lifeCode(s)}`, W - left, H - 64);
  return canvas;
}

interface Downloads {
  save(request: { filename: string; data: Blob }): Promise<{ status: string }>;
}
// Inside claude.ai the page is framed and saves go through the viewer; elsewhere a plain download works.
const host = (window as unknown as { claude?: { use(name: "downloads"): Promise<Downloads | null> } }).claude;

/** The card, a preview of it, and ways to keep it. */
export function ShareImage({ s, r }: { s: LifeState; r: Report }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [downloads, setDownloads] = useState<Promise<Downloads | null> | null>(null);

  useEffect(() => {
    let live = true;
    let made: string | null = null;
    drawCard(s, r).then((canvas) =>
      canvas.toBlob((b) => {
        if (!live || !b) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      }, "image/png"),
    );
    if (host?.use) setDownloads(host.use("downloads").catch(() => null));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [s, r]);

  const filename = `lot-in-life-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "life"}.png`;
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  const canShare = !host && !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const save = async () => {
    if (!blob || !url) return;
    setNote("");
    if (downloads) {
      const d = await downloads;
      if (!d) return setNote("Saving isn't available here. Press and hold the picture, or right-click it, to save it.");
      try {
        await d.save({ filename, data: blob });
        setNote("Saved.");
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "declined") return;
        setNote(code === "rate_limited" ? "Another save is waiting for an answer. Try again in a moment." : "That didn't save. Press and hold the picture, or right-click it, to save it.");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `Lot in Life: ${r.name}` });
    } catch {
      // the viewer closed the sheet
    }
  };

  return (
    <div className="share-card">
      {url ? <img src={url} width={W} height={H} alt={`The card for ${r.name}'s life: peak wealth ${usd(r.peakUsd)}, grade ${r.grade}`} /> : <div className="share-card-wait">Drawing your card…</div>}
      <div className="actions">
        <button className="btn small" onClick={save} disabled={!blob}>
          Save image
        </button>
        {canShare && (
          <button className="btn small" onClick={share}>
            Share…
          </button>
        )}
      </div>
      {note && (
        <p className="note" role="status" style={{ margin: 0 }}>
          {note}
        </p>
      )}
    </div>
  );
}

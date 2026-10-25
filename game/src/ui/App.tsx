import { useCallback, useEffect, useRef, useState } from "react";
import {
  country, countryName, flagEmoji, hasMarkets, newGame, randomSeed, setMarkets, setWorld,
  type LifeState, type MarketsData, type Report, type Setup, type WorldData,
} from "../engine";
import { Birth } from "./Birth";
import { End } from "./End";
import { Play } from "./Play";
import { Start } from "./Start";
import { loadLives, saveLife, type PastLife } from "./storage";

type Screen = "loading" | "error" | "start" | "birth" | "play" | "end";

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [lives, setLives] = useState<PastLife[]>(() => loadLives());
  const life = useRef<LifeState | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    fetch("./data/world.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<WorldData>;
      })
      .then((w) => {
        setWorld(w);
        setScreen("start");
        // monthly prices only draw the front pages' charts and run the desk, so they load behind the start screen
        fetch("./data/markets.json")
          .then((r) => (r.ok ? (r.json() as Promise<MarketsData>) : null))
          .then((m) => {
            if (m && !hasMarkets()) {
              setMarkets(m);
              refresh();
            }
          })
          .catch(() => {});
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setScreen("error");
      });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  const start = (setup: Setup) => {
    life.current = newGame(setup);
    refresh();
    setScreen("birth");
  };

  const onReport = (r: Report) => {
    const s = life.current!;
    setLives(
      saveLife({
        name: s.name,
        country: countryName(s.birthCountry),
        flag: flagEmoji(country(s.birthCountry).i2),
        birthYear: s.birthYear,
        deathYear: s.death?.year ?? s.year,
        age: s.death?.age ?? s.age,
        peakUsd: r.peakUsd,
        grade: r.age < 18 ? "—" : r.grade,
        mode: s.mode,
        seed: s.seed,
      }),
    );
  };

  if (screen === "loading") {
    return (
      <main className="loading">
        <span className="eyebrow">Lot in Life</span>
        <p>Loading 65 years of the world's economic history…</p>
      </main>
    );
  }
  if (screen === "error") {
    return (
      <main className="loading">
        <span className="eyebrow">Lot in Life</span>
        <p>The data file didn't load ({error}). Reload the page to try again.</p>
      </main>
    );
  }
  const s = life.current;
  if (screen === "start" || !s) return <Start onStart={start} lives={lives} />;
  if (screen === "birth") return <Birth s={s} onBegin={() => setScreen("play")} />;
  if (screen === "play") return <Play s={s} version={version} refresh={refresh} onDeath={() => setScreen("end")} />;
  return (
    <End
      s={s}
      onReport={onReport}
      onAgain={() => setScreen("start")}
      onReplay={() => start({ ...s.setup, seed: s.setup.seed ?? randomSeed() })}
    />
  );
}

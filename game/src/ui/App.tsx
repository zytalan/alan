import { useCallback, useEffect, useRef, useState } from "react";
import {
  country, countryIn, countryIsos, countryName, flagEmoji, hasMarkets, newGame, randomSeed, setMarkets, setWorld,
  type LifeState, type MarketsData, type Report, type Setup, type WorldData,
} from "../engine";
import { Birth } from "./Birth";
import { End } from "./End";
import { Play } from "./Play";
import { Start } from "./Start";
import { clearCurrent, loadCurrent, loadLives, saveCurrent, saveLife, type PastLife, type SavedLife } from "./storage";

type Screen = "loading" | "error" | "start" | "birth" | "play" | "end";

export function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [lives, setLives] = useState<PastLife[]>(() => loadLives());
  const life = useRef<LifeState | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  // the unfinished life kept in this browser, and a new life waiting on the player's say-so to replace it
  const [unfinished, setUnfinished] = useState<SavedLife | null>(null);
  const [replacing, setReplacing] = useState<Setup | null>(null);
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;
  const lastSave = useRef(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    fetch("./data/world.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<WorldData>;
      })
      .then((w) => {
        setWorld(w);
        const saved = loadCurrent();
        const isos = new Set(countryIsos());
        if (saved && isos.has(saved.life.country) && isos.has(saved.life.birthCountry)) setUnfinished(saved);
        else if (saved) clearCurrent();
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

  // Save the life as it's played: at most once a second, and right away when the page is hidden.
  const saveNow = useCallback(() => {
    if (saveTimer.current != null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const at = screenRef.current;
    if (!life.current || (at !== "birth" && at !== "play")) return;
    saveCurrent(life.current, at);
    lastSave.current = Date.now();
  }, []);
  useEffect(() => {
    if ((screen !== "birth" && screen !== "play") || saveTimer.current != null) return;
    saveTimer.current = window.setTimeout(saveNow, Math.max(0, 1000 - (Date.now() - lastSave.current)));
  }, [version, screen, saveNow]);
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && saveNow();
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [saveNow]);

  const begin = (setup: Setup) => {
    clearCurrent();
    setUnfinished(null);
    setReplacing(null);
    life.current = newGame(setup);
    refresh();
    setScreen("birth");
  };
  // only one unfinished life is kept, so a new one asks first
  const start = (setup: Setup) => (unfinished ? setReplacing(setup) : begin(setup));

  const resume = async () => {
    const saved = unfinished;
    if (!saved) return;
    if (saved.life.desk && !hasMarkets()) {
      // a trading account can't be valued without the monthly prices
      setScreen("loading");
      try {
        const r = await fetch("./data/markets.json");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setMarkets((await r.json()) as MarketsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setScreen("error");
        return;
      }
    }
    life.current = saved.life;
    setUnfinished(null);
    refresh();
    setScreen(saved.life.alive ? saved.screen : "end");
  };

  const onReport = (r: Report) => {
    clearCurrent();
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
  if (screen === "start" || !s) {
    return (
      <>
        <Start onStart={start} lives={lives} unfinished={unfinished} onContinue={resume} />
        {replacing && unfinished && <ReplaceLife saved={unfinished} onReplace={() => begin(replacing)} onKeep={() => setReplacing(null)} />}
      </>
    );
  }
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

/** Starting a new life ends the unfinished one, so ask first. */
function ReplaceLife({ saved, onReplace, onKeep }: { saved: SavedLife; onReplace: () => void; onKeep: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onKeep();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeep]);
  const l = saved.life;
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onKeep()}>
      <section className="decision" role="dialog" aria-modal="true" aria-labelledby="replace-title">
        <span className="eyebrow">Unfinished life</span>
        <h2 id="replace-title">Start a new life?</h2>
        <p className="body">
          {l.name} is {l.age}, living in {countryIn(l.country)} in {l.year}. Only one unfinished life is kept, so a new one ends
          theirs.
        </p>
        <div className="row">
          <button className="btn primary" onClick={onReplace}>
            Start the new life
          </button>
          <button ref={keep} className="btn" onClick={onKeep}>
            Keep {l.name}'s life
          </button>
        </div>
      </section>
    </div>
  );
}

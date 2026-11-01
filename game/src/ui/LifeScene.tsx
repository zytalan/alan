// The picture of your life this year, drawn in pixels: who's with you, where you live, what you
// drive, the hour of your life and the weather of the year. It changes as the life does.

import { useEffect, useMemo, useRef, useState } from "react";
import { sceneOf, type LifeState, type Scene } from "../engine";
import { paintScene, SCENE_H } from "./pixel/paint";

/** Whole-pixel scale for a box this wide, and how many scene pixels fit across at it. */
export function sceneSize(box: number): { scale: number; w: number } {
  const scale = Math.max(2, Math.min(4, Math.floor(box / 200)));
  return { scale, w: Math.max(140, Math.min(260, Math.floor(box / scale))) };
}

export function SceneCanvas({ scene, className }: { scene: Scene; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const { scale, w } = sceneSize(width);
    const b = paintScene(scene, w);
    c.width = w;
    c.height = SCENE_H;
    c.style.width = `${w * scale}px`;
    c.style.height = `${SCENE_H * scale}px`;
    c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(b.data), w, SCENE_H), 0, 0);
  }, [scene, width]);
  return (
    <div className={`scene-box ${className ?? ""}`} ref={box}>
      <canvas ref={canvas} role="img" aria-label={scene.caption} />
    </div>
  );
}

export function LifeScene({ s, version }: { s: LifeState; version: number }) {
  // version changes whenever the life does
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => sceneOf(s), [s, version]);
  return (
    <figure className="life-scene">
      <SceneCanvas scene={scene} />
      <figcaption>{scene.caption}</figcaption>
    </figure>
  );
}

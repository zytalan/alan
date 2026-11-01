// A small pixel canvas with the few tools the life scene is drawn with: colours mixed and darkened,
// ordered dithering, filled shapes and sprites with outlines tinted to what they enclose.

export type RGB = [number, number, number];
export type Sprite = (RGB | null)[][];

const cache = new Map<string, RGB>();
export function rgb(c: string | RGB): RGB {
  if (typeof c !== "string") return c;
  let v = cache.get(c);
  if (!v) {
    const h = c.replace("#", "");
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    cache.set(c, v);
  }
  return v;
}

export function mix(a: string | RGB, b: string | RGB, t: number): RGB {
  const x = rgb(a);
  const y = rgb(b);
  return [Math.round(x[0] + (y[0] - x[0]) * t), Math.round(x[1] + (y[1] - x[1]) * t), Math.round(x[2] + (y[2] - x[2]) * t)];
}

/** A shade toward a cool purple rather than black, so dark edges stay soft. */
export function darker(c: string | RGB, k = 0.72): RGB {
  return mix(c, [40, 28, 60], 1 - k);
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
export const bayer = (x: number, y: number) => (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;

/** A seeded random stream, so a scene draws the same way every time. */
export function rand(seed: number): () => number {
  let a = seed | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Buffer {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
  }

  set(x: number, y: number, c: string | RGB | null | undefined): void {
    if (c == null) return;
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const v = rgb(c);
    const i = (y * this.w + x) * 4;
    this.data[i] = v[0];
    this.data[i + 1] = v[1];
    this.data[i + 2] = v[2];
  }

  get(x: number, y: number): RGB {
    const i = (Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  rect(x0: number, y0: number, w: number, h: number, c: string | RGB | ((x: number, y: number) => string | RGB | null)): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, typeof c === "function" ? c(x, y) : c);
  }

  /** Bands of colour top to bottom, dithered only where one turns into the next. */
  vgrad(x0: number, y0: number, w: number, h: number, stops: (string | RGB)[]): void {
    const n = stops.length - 1;
    for (let y = y0; y < y0 + h; y++) {
      const t = ((y - y0) / Math.max(1, h - 1)) * n;
      const i = Math.min(Math.floor(t), n - 1);
      const f = Math.min(1, Math.max(0, (t - i - 0.5) * 2.4 + 0.5));
      for (let x = x0; x < x0 + w; x++) this.set(x, y, f > bayer(x, y) ? stops[i + 1] : stops[i]);
    }
  }

  disc(cx: number, cy: number, r: number, c: string | RGB | ((x: number, y: number, d: number) => string | RGB | null)): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) this.set(x, y, typeof c === "function" ? c(x, y, d / r) : c);
      }
  }

  /** A filled polygon, by scanlines. */
  poly(pts: [number, number][], c: string | RGB | ((x: number, y: number) => string | RGB | null)): void {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        const yc = y + 0.5;
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, typeof c === "function" ? c(x, y) : c);
    }
  }

  stamp(s: Sprite, x0: number, y0: number, flip = false): void {
    const w = s[0]?.length ?? 0;
    for (let y = 0; y < s.length; y++) for (let x = 0; x < w; x++) this.set(x0 + (flip ? w - 1 - x : x), y0 + y, s[y][x]);
  }

  /** Lay a colour over everything, for the light of the hour and the weather. */
  tint(c: string | RGB, t: number): void {
    if (t <= 0) return;
    const v = rgb(c);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = Math.round(this.data[i] + (v[0] - this.data[i]) * t);
      this.data[i + 1] = Math.round(this.data[i + 1] + (v[1] - this.data[i + 1]) * t);
      this.data[i + 2] = Math.round(this.data[i + 2] + (v[2] - this.data[i + 2]) * t);
    }
  }
}

/** A sprite from a grid of colour keys, with every edge pixel darkened toward its own colour. */
export function sprite(keys: (string | null)[][], colors: Record<string, string | RGB>, keep = "", ol = 0.55): Sprite {
  const h = keys.length;
  const w = keys[0]?.length ?? 0;
  const out: Sprite = keys.map((row) => row.map((k) => (k ? rgb(colors[k] ?? "#ff00ff") : null)));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = keys[y][x];
      if (!k || keep.includes(k)) continue;
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => !keys[y + dy]?.[x + dx]);
      if (edge) out[y][x] = darker(colors[k], ol);
    }
  return out;
}

// The picture of a life in a given year, put together: the sky at the hour of life, the land of the
// climate, the home, the people, the ride and the props, then the light of the hour over all of it.

import type { Climate, Figure, Hour, Scene } from "../../engine";
import { bayer, Buffer, darker, mix, rand } from "./buffer";
import { HAIR, person, SKIN } from "./people";
import { BIZ_W, boxes, bunting, business, confetti, flowers, home, pram, PRAM_W, rain, ride, RIDE_W, snowfall, toys, tree, yard, type Light } from "./places";

export const SCENE_H = 100;
const GROUND = 84; // where feet stand
const HORIZON = 64;

const SKY: Record<Hour, string[]> = {
  morning: ["#9fd0ee", "#c4e4f4", "#f6dcc8"],
  day: ["#8ecdf0", "#b4dff6", "#e0f2f8"],
  afternoon: ["#8fc1e8", "#bad9ee", "#f2e2c4"],
  golden: ["#7180c0", "#c98d9a", "#f2a978", "#ffd39a"],
  dusk: ["#2a2450", "#4e3570", "#9a4e74", "#e07a5e"],
};
const SNOW_SKY = ["#bcd2e4", "#d6e4f0", "#edf4f9"];
const HOUR_LIGHT: Record<Hour, [string, number]> = {
  morning: ["#ffc0a8", 0.05],
  day: ["#ffffff", 0],
  afternoon: ["#ffd9a0", 0.06],
  golden: ["#ffae66", 0.15],
  dusk: ["#3e3170", 0.2],
};

const LAND = {
  temperate: { grass: ["#8cc97e", "#6fb067", "#a8db94"], hills: ["#b7dcb0", "#9fd09a"], path: "#e6d2a8" },
  cold: { grass: ["#86c27e", "#69a867", "#a2d494"], hills: ["#b0d2bc", "#93c2a2"], path: "#e0d0b0" },
  tropical: { grass: ["#6cb86a", "#4e9a55", "#8ad07e"], hills: ["#86c890", "#62b072"], path: "#cf9666" },
  arid: { grass: ["#e8c98a", "#d4b070", "#f2dca8"], hills: ["#f0d6a2", "#e2be80"], path: "#d4a86a" },
};
const SNOW_LAND = { grass: ["#f3f7fb", "#d5e3ef", "#ffffff"], hills: ["#e6eef5", "#d6e3ee"], path: "#d8cfc4" };

function cloud(b: Buffer, x: number, y: number, s: number, light: string, shade: string): void {
  const blobs: [number, number, number][] = [
    [0, 2, 5],
    [6, 0, 6],
    [12, 2, 5],
    [5, 4, 5],
    [-4, 4, 3],
    [16, 4, 3],
  ];
  let base = 0;
  for (const [, by, r] of blobs) base = Math.max(base, y + (by + r) * s);
  for (const [bx, by, r] of blobs) b.disc(x + bx * s, y + by * s, r * s, (_xx, yy) => (yy >= base - 2 * s ? shade : light));
}

function sun(b: Buffer, x: number, y: number, r: number, core: string, edge: string): void {
  for (let yy = Math.floor(y - r - 6); yy <= y + r + 6; yy++)
    for (let xx = Math.floor(x - r - 6); xx <= x + r + 6; xx++) {
      const d = Math.hypot(xx - x, yy - y);
      if (d <= r) b.set(xx, yy, d < r - 1.5 || (xx + yy) % 2 ? core : edge);
      else if (d <= r + 6 && bayer(xx, yy) < (1 - (d - r) / 6) * 0.5) b.set(xx, yy, mix(b.get(xx, yy), core, 0.5));
    }
}

function hills(b: Buffer, w: number, far: string, near: string, seed: number, city: boolean): void {
  if (city) {
    // a skyline of blocks, pale with distance
    const r = rand(seed);
    let x = 0;
    while (x < w) {
      const bw = 8 + Math.floor(r() * 14);
      const bh = 10 + Math.floor(r() * 22);
      for (let yy = HORIZON - bh; yy < HORIZON + 2; yy++)
        for (let xx = x; xx < x + bw; xx++) b.set(xx, yy, (xx - x) % 4 === 1 && (yy - (HORIZON - bh)) % 4 === 2 ? mix(far, "#ffffff", 0.35) : far);
      x += bw + Math.floor(r() * 3);
    }
  }
  for (let x = 0; x < w; x++) {
    const h1 = Math.round(7 + 4 * Math.sin(x / 23 + seed) + 3 * Math.sin(x / 9 + 1));
    const h2 = Math.round(4 + 3 * Math.sin(x / 17 + 2 + seed) + 2 * Math.sin(x / 7));
    if (!city) for (let yy = HORIZON - h1; yy < HORIZON + 2; yy++) b.set(x, yy, far);
    for (let yy = HORIZON - h2 + 2; yy < HORIZON + 2; yy++) b.set(x, yy, near);
  }
}

function ground(b: Buffer, w: number, grass: string[], seed: number, flowersToo: boolean): void {
  const r = rand(seed);
  for (let y = HORIZON + 2; y < SCENE_H; y++) {
    const t = (y - HORIZON) / (SCENE_H - HORIZON);
    for (let x = 0; x < w; x++) b.set(x, y, t > 0.55 && bayer(x, y) < (t - 0.55) * 1.6 ? grass[1] : grass[0]);
  }
  for (let i = 0; i < w * 1.6; i++) {
    const x = Math.floor(r() * w);
    const y = HORIZON + 3 + Math.floor(r() * (SCENE_H - HORIZON - 3));
    b.set(x, y, grass[2]);
    if (r() < 0.5) b.set(x, y - 1, r() < 0.5 ? grass[2] : grass[1]);
  }
  if (flowersToo) for (let i = 0; i < w * 0.18; i++) b.set(Math.floor(r() * w), HORIZON + 4 + Math.floor(r() * 30), ["#f28ba8", "#ffd166", "#ffffff", "#c49bf0"][i % 4]);
  for (let x = 0; x < w; x++) b.set(x, HORIZON + 2, grass[2]);
}

function path(b: Buffer, x: number, color: string): void {
  for (let y = GROUND; y < SCENE_H; y++) {
    const half = 5 + Math.floor((y - GROUND) / 2);
    for (let xx = x - half; xx < x + half; xx++) b.set(xx, y, (xx + y * 3) % 7 ? ((Math.floor(xx / 4) + Math.floor(y / 3)) % 2 ? color : mix(color, "#ffffff", 0.12)) : darker(color, 0.82));
  }
}

/** Paint the scene `w` pixels wide and SCENE_H tall. */
export function paintScene(sc: Scene, w = 200): Buffer {
  const b = new Buffer(w, SCENE_H);
  const snow = sc.weather === "snow";
  const wet = sc.weather === "rain";
  const land = snow ? SNOW_LAND : LAND[sc.climate];
  const L: Light = { glow: sc.hour === "golden" || sc.hour === "dusk" || wet, snow, shabby: sc.home.shabby };
  const r = rand(sc.seed);

  // sky, sun or stars, and clouds by the weather
  const sky = snow ? SNOW_SKY : wet ? SKY[sc.hour].map((c) => mix(c, "#8a93a3", 0.55)) : SKY[sc.hour];
  b.vgrad(0, 0, w, HORIZON + 4, sky);
  if (sc.hour === "dusk" && !wet) for (let i = 0; i < w * 0.25; i++) b.set(Math.floor(r() * w), Math.floor(r() * 30), r() < 0.7 ? "#fff6d8" : "#c8c0f0");
  if (!wet) {
    const spot: Record<Hour, [number, number]> = { morning: [0.16, 26], day: [0.84, 13], afternoon: [0.86, 22], golden: [0.82, 44], dusk: [0.8, 60] };
    const [fx, sy] = spot[sc.hour];
    sun(b, Math.round(w * fx), sy, sc.hour === "golden" || sc.hour === "dusk" ? 9 : 7, sc.hour === "dusk" ? "#ffb070" : "#ffe9a8", sc.hour === "dusk" ? "#e07a5e" : "#ffd27a");
  }
  const n = wet ? 7 : sc.weather === "clouds" ? 4 : snow ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const s = wet ? 1.3 : 0.7 + r() * 0.5;
    cloud(b, Math.floor(((i + 0.3 + r() * 0.5) / n) * w) - 8, wet ? 2 + Math.floor(r() * 10) : 6 + Math.floor(r() * 18), s, wet ? "#9aa2b2" : sc.hour === "dusk" ? "#b07a90" : sc.hour === "golden" ? "#f3c0a0" : "#ffffff", wet ? "#7a8292" : sc.hour === "dusk" ? "#7a5a80" : "#d6e6f0");
  }
  hills(b, w, land.hills[0], land.hills[1], sc.seed % 7, sc.home.kind === "apartment");
  ground(b, w, land.grass, sc.seed, !snow && !wet && sc.climate !== "arid");

  // from the right a ride and the home, from the left a business or a tree, and the people between;
  // when it's tight the ride and then the home run off the edge, and the people stand in front
  const order = [...sc.figures].sort((a, b2) => rank(b2.role) - rank(a.role));
  let slots = order.map(slot);
  const rw = RIDE_W[sc.ride] ?? 0;
  const ext = reach(sc.home.kind, sc.climate, L, sc.seed);
  const bizW = sc.business ? (BIZ_W[sc.business.type] ?? 38) : 0;
  let shift = 0;
  let homeRight = rw ? w - 3 - rw - 3 : w - 8;
  let leftEdge = sc.business ? bizW + 6 : 26;
  let treeLeft = !sc.business;
  const group = () => slots.reduce((n, k) => n + k, 0);
  let cx = homeRight - ext.right;
  let peopleRight = cx + ext.left - 1;
  let short = leftEdge - (peopleRight - group());
  if (short > 0 && treeLeft) {
    treeLeft = false;
    leftEdge = 3;
    short = leftEdge - (peopleRight - group());
  }
  if (short > 0) {
    // the ride half off the edge
    shift = Math.min(short, Math.floor(rw * 0.5));
    short -= shift;
  }
  if (short > 0) {
    // the people step forward in front of the home, short of its door
    const room = Math.max(0, cx + shift + ext.door - 9 - (peopleRight + shift));
    peopleRight += Math.min(short, room);
    short -= Math.min(short, room);
  }
  if (short > 0) {
    // the home's far side off the edge, its door still in the picture
    const more = Math.max(0, Math.min(short, w - 14 - (cx + shift + ext.door)));
    shift += more;
    short -= more;
  }
  if (short > 0) slots = slots.map((k) => Math.max(k - 3, 10));
  cx += shift;
  peopleRight += shift;

  const at = home(b, sc.home.kind, cx, GROUND, sc.climate, L, sc.seed);
  const pathC = snow ? SNOW_LAND.path : LAND[sc.climate].path;
  path(b, at.door, pathC);
  for (let x = at.door - 7; x < at.door + 7; x++) b.set(x, GROUND, darker(pathC, 0.85));
  if (sc.business) business(b, sc.business.type, 3, GROUND, L);
  else if (treeLeft) tree(b, 14, GROUND, 9, sc.climate, L, sc.seed + 1);
  const rideX = cx + ext.right + 3;
  if (rw) ride(b, sc.ride, rideX, GROUND + 4, sc.seed);
  if ((rw ? rideX + rw : cx + ext.right) + 12 < w) tree(b, w - 7, GROUND - 2, 6, sc.climate, L, sc.seed + 2);

  if (sc.props.includes("boxes")) boxes(b, at.door + 9, GROUND + 1);
  if (sc.props.includes("flowers")) flowers(b, at.door - 16, GROUND + 1);

  // people, right to left: children nearest the door, then you, then the others
  let x = peopleRight;
  order.forEach((f, i) => {
    x -= slots[i];
    if (f.stage === "baby") {
      pram(b, x, GROUND + 2, SKIN[f.skin], HAIR[f.hair]);
      return;
    }
    const sp = person(f);
    for (let k = 3; k < 15; k++) b.set(x + k - 2, GROUND + 2, darker(b.get(x + k - 2, GROUND + 2), 0.85));
    b.stamp(sp, x - 2, GROUND + 2 - sp.length);
  });
  if (sc.props.includes("toys")) toys(b, Math.max(6, x + 6), SCENE_H - 4);
  // what's round the home, in the ground left between the people and the tree or business
  yard(b, sc.home.kind, (sc.business ? bizW + 8 : treeLeft ? 28 : 3), x - 3, GROUND, L, sc.seed + 7);

  if (sc.props.includes("bunting")) bunting(b, 6, Math.min(w - 6, at.left + 10), 30);
  if (sc.props.includes("confetti")) confetti(b, w, SCENE_H, sc.seed + 5);
  if (snow) snowfall(b, w, SCENE_H, sc.seed + 3);
  if (wet) rain(b, w, SCENE_H, sc.seed + 4);
  // the light of the hour of life, and the grey of a hard year
  const [tint, amount] = HOUR_LIGHT[sc.hour];
  b.tint(tint, amount);
  if (wet) b.tint("#6a7484", 0.12);
  return b;
}

function slot(f: Figure): number {
  return f.stage === "baby" ? PRAM_W + 1 : f.stage === "child" ? 12 : 14;
}

/** How far a home reaches either side of its centre, found by drawing it once off to the side. */
const reaches = new Map<string, { left: number; right: number; door: number }>();
function reach(kind: string, climate: Climate, L: Light, seed: number): { left: number; right: number; door: number } {
  const key = `${kind}|${climate}|${seed}`;
  const hit = reaches.get(key);
  if (hit) return hit;
  const t = new Buffer(300, SCENE_H);
  const at = home(t, kind, 150, GROUND, climate, L, seed);
  let lo = 300;
  let hi = -1;
  for (let x = 0; x < 300; x++)
    for (let y = 0; y < SCENE_H; y++) {
      const i = (y * 300 + x) * 4;
      if (t.data[i] | t.data[i + 1] | t.data[i + 2]) {
        lo = Math.min(lo, x);
        hi = x;
        break;
      }
    }
  const r = { left: lo - 150, right: hi - 150, door: at.door - 150 };
  if (reaches.size > 64) reaches.clear();
  reaches.set(key, r);
  return r;
}

function rank(role: string): number {
  return role === "child" ? 3 : role === "you" ? 2 : role === "partner" ? 1 : 0;
}

// Homes from a hut to a villa, trees for each climate, and the props of a year: a car or a bike,
// a pram, moving boxes, bunting, flowers, toys, a market stall or a shop.

import type { Climate } from "../../engine";
import { bayer, Buffer, darker, mix, rand, type RGB } from "./buffer";

export interface Light {
  glow: boolean; // windows lit, from golden hour on
  snow: boolean;
  shabby: boolean;
}

const GLASS = ["#bfe3f5", "#8fc3e0"];
const GLOW = "#ffd98a";

function windowPane(b: Buffer, x: number, y: number, w: number, h: number, L: Light, frame = "#fffaf0", cross = true) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const edge = xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1;
      const bar = cross && (xx === x + (w >> 1) || yy === y + (h >> 1));
      let c: string | RGB = edge || bar ? frame : L.glow ? ((xx + yy) % 7 ? GLOW : "#fff2c4") : (yy - y) / h < bayer(xx, yy) * 0.8 + 0.1 ? GLASS[0] : GLASS[1];
      if (!edge && !bar && !L.glow && xx - x + yy - y === 3) c = "#eef8ff";
      if (L.shabby && !edge && (xx * 7 + yy * 3) % 11 === 0) c = darker(GLASS[1], 0.7);
      b.set(xx, yy, c);
    }
}

function door(b: Buffer, x: number, y: number, w: number, h: number, c: string) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) b.set(xx, yy, xx === x || xx === x + w - 1 || yy === y ? darker(c, 0.65) : (xx - x) % 3 ? c : darker(c, 0.85));
  b.set(x + w - 3, y + (h >> 1) + 1, "#ffd166");
}

function walls(b: Buffer, x: number, y: number, w: number, h: number, c: string, L: Light, siding = true) {
  const base = L.shabby ? mix(c, "#9a9488", 0.35) : c;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      let k: RGB | string = siding && (yy - y) % 4 === 3 ? darker(base, 0.93) : base;
      if (xx >= x + w - Math.max(4, w >> 3)) k = darker(k, 0.9);
      if (yy < y + 2) k = darker(k, 0.85);
      b.set(xx, yy, k);
    }
  for (let yy = y; yy < y + h; yy++) {
    b.set(x, yy, darker(base, 0.6));
    b.set(x + w - 1, yy, darker(base, 0.55));
  }
  if (L.shabby) {
    const r = rand(x * 13 + y);
    for (let i = 0; i < 3; i++) {
      let cx = x + 3 + Math.floor(r() * (w - 8));
      let cy = y + 3 + Math.floor(r() * (h - 8));
      for (let k = 0; k < 5; k++) b.set((cx += r() < 0.5 ? 1 : 0), cy++, darker(base, 0.55));
    }
  }
}

function gable(b: Buffer, x: number, y: number, w: number, rise: number, c: string, L: Light, tiles = true) {
  const apex = x + w / 2;
  for (let yy = y - rise; yy <= y + 1; yy++) {
    const t = (yy - (y - rise)) / (rise + 1);
    const half = 3 + t * (w / 2 + 2);
    for (let xx = Math.round(apex - half); xx < Math.round(apex + half); xx++) {
      const row = Math.floor((yy - (y - rise)) / 3);
      let k: RGB | string = c;
      if (tiles && ((yy - (y - rise)) % 3 === 2 || (xx + row * 2) % 6 === 0)) k = darker(c, 0.82);
      if (xx < Math.round(apex - half) + 2) k = mix(c, "#ffffff", 0.18);
      if (L.snow && yy - (y - rise) < 5 + ((xx * 7) % 3)) k = (xx + yy) % 5 ? "#ffffff" : "#dbe7f2";
      b.set(xx, yy, k);
    }
    b.set(Math.round(apex - half) - 1, yy, darker(c, 0.55));
    b.set(Math.round(apex + half), yy, darker(c, 0.55));
  }
  for (let xx = Math.round(apex - w / 2 - 5); xx < Math.round(apex + w / 2 + 5); xx++) b.set(xx, y + 1, darker(c, 0.55));
}

/** A home standing on the ground line `gy`, centred at `cx`; returns where its door is. */
export function home(b: Buffer, kind: string, cx: number, gy: number, climate: Climate, L: Light, seed: number): { door: number; left: number; right: number } {
  const r = rand(seed);
  if (kind === "hut") {
    const w = 34;
    const x = cx - w / 2;
    const arid = climate === "arid";
    walls(b, x, gy - 20, w, 20, arid ? "#d9b58a" : "#b98a5e", L, false);
    for (let yy = gy - 20; yy < gy; yy++) for (let xx = x; xx < x + w; xx++) if ((xx * 3 + yy * 7) % 13 === 0) b.set(xx, yy, darker(arid ? "#d9b58a" : "#b98a5e", 0.85));
    if (arid) {
      for (let xx = x - 2; xx < x + w + 2; xx++) b.set(xx, gy - 21, "#a8835a"), b.set(xx, gy - 22, "#c49a6a");
    } else {
      // a thatched roof
      for (let yy = gy - 38; yy <= gy - 19; yy++) {
        const half = 2 + ((yy - (gy - 38)) / 19) * (w / 2 + 5);
        for (let xx = Math.round(cx - half); xx < Math.round(cx + half); xx++) b.set(xx, yy, (xx + yy * 2) % 4 ? "#d9b65e" : "#b8913e");
        b.set(Math.round(cx - half) - 1, yy, "#8a6a2e");
        b.set(Math.round(cx + half), yy, "#8a6a2e");
      }
    }
    door(b, cx - 4, gy - 14, 9, 14, "#7a4a32");
    windowPane(b, x + 4, gy - 15, 7, 6, L, "#8a6a4a", false);
    return { door: cx, left: x, right: x + w };
  }
  if (kind === "simple") {
    const w = 46;
    const x = cx - w / 2;
    const paint = ["#e8d8b8", "#cfe0d8", "#f0d0c0", "#d8d8e8"][Math.floor(r() * 4)];
    walls(b, x, gy - 24, w, 24, paint, L, false);
    // a corrugated metal roof, a little lower on one side
    for (let yy = gy - 31; yy <= gy - 24; yy++) {
      const slope = Math.round(((yy - (gy - 31)) / 7) * 2);
      for (let xx = x - 3 + slope; xx < x + w + 3; xx++) b.set(xx, yy, L.snow && yy < gy - 28 ? "#ffffff" : xx % 3 === 0 ? "#8a9298" : "#b4bcc2");
    }
    door(b, cx + 4, gy - 16, 9, 16, "#5a7a9a");
    windowPane(b, x + 5, gy - 18, 10, 8, L, "#f5f2ea");
    for (let xx = x + 6; xx < x + 15; xx += 2) for (let yy = gy - 17; yy < gy - 11; yy++) b.set(xx, yy, "#6a6a72");
    return { door: cx + 8, left: x, right: x + w };
  }
  if (kind === "apartment") {
    const w = 64;
    const x = cx - w / 2;
    const top = gy - 66;
    const paint = ["#e8c8a8", "#c8d8e8", "#e0d0e8", "#d8e0c8"][Math.floor(r() * 4)];
    // a neighbouring block behind, then yours
    walls(b, x + w - 6, top + 12, 26, 66 - 12, mix(paint, "#8a9aa8", 0.35) as unknown as string, L, false);
    walls(b, x, top, w, 66, paint, L, false);
    for (let xx = x - 1; xx < x + w + 1; xx++) b.set(xx, top - 1, darker(paint, 0.6)), b.set(xx, top - 2, darker(paint, 0.75));
    const mine = Math.floor(r() * 3);
    for (let fl = 0; fl < 4; fl++)
      for (let i = 0; i < 4; i++) {
        const wx = x + 5 + i * 15;
        const wy = top + 5 + fl * 15;
        const lit = L.glow && (fl * 4 + i + seed) % 3 !== 0;
        windowPane(b, wx, wy, 10, 9, { ...L, glow: lit || (L.glow && fl === 1 && i === mine) }, "#f5f2ea");
        // a balcony rail under each window
        for (let xx = wx - 1; xx < wx + 11; xx++) b.set(xx, wy + 10, "#6a6a78");
        if (fl === 1 && i === mine) for (let xx = wx; xx < wx + 10; xx += 2) b.set(xx, wy + 9, ["#f28ba8", "#ffd166", "#8cc97e"][xx % 3]);
      }
    door(b, cx - 6, gy - 12, 12, 12, "#6a5a7a");
    return { door: cx, left: x, right: x + w + 20 };
  }
  if (kind === "house") {
    const w = 60;
    const x = cx - w / 2;
    const paint = ["#f6e7cf", "#dfeaf3", "#f3dcd2", "#e6efd8"][Math.floor(r() * 4)];
    walls(b, x, gy - 36, w, 36, paint, L);
    gable(b, x, gy - 36, w, 24, ["#d97b6c", "#7a8aa8", "#8a6a5a"][Math.floor(r() * 3)], L);
    for (let yy = gy - 58; yy < gy - 44; yy++) for (let xx = x + 42; xx < x + 49; xx++) b.set(xx, yy, yy % 3 && (xx + Math.floor(yy / 3) * 2) % 4 ? "#c47a5a" : "#9a5a42");
    windowPane(b, x + 7, gy - 28, 13, 12, L);
    windowPane(b, x + 40, gy - 28, 13, 12, L);
    for (const wx of [x + 7, x + 40]) for (let xx = wx - 1; xx < wx + 14; xx++) b.set(xx, gy - 15, "#a0704f"), b.set(xx, gy - 16, ["#f28ba8", "#ffd166", "#ffffff"][xx % 3]);
    door(b, cx - 5, gy - 22, 11, 22, "#9a6a4a");
    return { door: cx, left: x, right: x + w };
  }
  if (kind === "big") {
    const w = 84;
    const x = cx - w / 2;
    const paint = ["#f3ece0", "#e8eef5", "#f5e3d6"][Math.floor(r() * 3)];
    walls(b, x, gy - 48, w - 22, 48, paint, L);
    gable(b, x, gy - 48, w - 22, 22, "#5a6a8a", L);
    // a garage to one side
    walls(b, x + w - 24, gy - 26, 24, 26, paint, L);
    for (let yy = gy - 30; yy < gy - 26; yy++) for (let xx = x + w - 26; xx < x + w + 2; xx++) b.set(xx, yy, L.snow ? "#ffffff" : "#5a6a8a");
    for (let yy = gy - 20; yy < gy; yy++) for (let xx = x + w - 21; xx < x + w - 3; xx++) b.set(xx, yy, (yy % 3 ? "#d8d4cc" : "#b8b4ac"));
    for (const fl of [0, 1]) for (const i of [0, 1, 2]) if (!(fl === 0 && i === 1)) windowPane(b, x + 6 + i * 19, gy - 42 + fl * 21, 12, 12, L);
    door(b, x + 25, gy - 20, 12, 20, "#6a4a3a");
    // a hedge along the front
    for (let xx = x - 4; xx < x + w + 4; xx++) for (let yy = gy - 4; yy < gy; yy++) if ((xx < x + 22 || xx > x + 40) && !(xx > x + w - 24)) b.set(xx, yy, (xx + yy) % 3 ? "#5a9a55" : "#7cbf6a");
    return { door: x + 31, left: x, right: x + w };
  }
  // a villa: wide and low, columns along a porch, a pool in front
  const w = 104;
  const x = cx - w / 2;
  walls(b, x, gy - 40, w, 40, "#f7f3ea", L, false);
  for (let xx = x - 4; xx < x + w + 4; xx++) for (let yy = gy - 46; yy < gy - 40; yy++) b.set(xx, yy, L.snow && yy < gy - 43 ? "#ffffff" : yy === gy - 41 ? "#b8b0a0" : "#d8d0c0");
  for (let i = 0; i < 6; i++) {
    const px = x + 8 + i * 18;
    for (let yy = gy - 40; yy < gy; yy++) b.set(px, yy, "#ffffff"), b.set(px + 1, yy, "#e8e2d6"), b.set(px + 2, yy, "#cfc8ba");
  }
  for (let i = 0; i < 5; i++) windowPane(b, x + 13 + i * 18, gy - 33, 11, 22, L, "#f7f3ea", false);
  door(b, cx - 7, gy - 24, 14, 24, "#7a5a3a");
  for (let xx = x + 6; xx < x + w - 6; xx++) for (let yy = gy + 3; yy < gy + 8; yy++) b.set(xx, yy, yy === gy + 3 ? "#ffffff" : (xx + yy) % 5 ? "#6fc3e0" : "#a8e0f2");
  return { door: cx, left: x, right: x + w };
}

/** A tree of the climate, standing on `gy`. */
export function tree(b: Buffer, x: number, gy: number, size: number, climate: Climate, L: Light, seed: number): void {
  const r = rand(seed);
  if (climate === "tropical" || (climate === "arid" && size > 9)) {
    // a palm: a curved trunk and fronds
    let tx = x;
    for (let yy = gy; yy > gy - size * 3; yy--) {
      if ((gy - yy) % 6 === 5) tx += 1;
      b.set(tx, yy, (gy - yy) % 3 ? "#9a7a52" : "#7a5a3a");
      b.set(tx + 1, yy, "#7a5a3a");
    }
    const top = gy - size * 3;
    for (const [dx, dy] of [[-1, 0], [1, 0], [-0.6, 0.6], [0.6, 0.6], [0, -1], [-1, -0.3], [1, -0.3]]) {
      for (let k = 1; k < size + 2; k++) {
        const fx = Math.round(tx + dx * k);
        const fy = Math.round(top + dy * k + (k * k) / (size * 1.6));
        b.set(fx, fy, k % 2 ? "#3e8e4a" : "#5aae5a");
        b.set(fx, fy + 1, "#2e6e3a");
      }
    }
    b.disc(tx + 1, top + 2, 1.6, "#7a5a3a");
    return;
  }
  if (climate === "arid") {
    // a cactus
    for (let yy = gy; yy > gy - size * 2; yy--) for (let xx = x - 1; xx <= x + 1; xx++) b.set(xx, yy, xx === x + 1 ? "#4a7a4a" : "#6aa86a");
    for (let yy = gy - size; yy > gy - size - 6; yy--) b.set(x - 3, yy, "#6aa86a"), b.set(x + 3, yy - 2, "#6aa86a");
    b.set(x - 2, gy - size, "#6aa86a"), b.set(x + 2, gy - size - 2, "#6aa86a");
    return;
  }
  const pine = climate === "cold" && r() < 0.5;
  for (let yy = gy; yy > gy - (pine ? 6 : 10); yy--) b.set(x, yy, "#8a5e44"), b.set(x + 1, yy, "#6a4634");
  if (pine) {
    for (let tier = 0; tier < 4; tier++) {
      const base = gy - 6 - tier * 6;
      for (let yy = base - 7; yy <= base; yy++) {
        const half = ((yy - (base - 7)) / 7) * (size - tier * 1.5);
        for (let xx = Math.round(x - half); xx <= Math.round(x + 1 + half); xx++) b.set(xx, yy, L.snow && yy < base - 4 ? "#ffffff" : xx > x ? "#2e6e4a" : "#3e8e5a");
      }
    }
    return;
  }
  const leaf = L.snow ? ["#ffffff", "#c9dbe6", "#8aa8a0"] : ["#a8d98a", "#7cbf6a", "#5a9a55"];
  const blobs: [number, number, number][] = [
    [0, -size * 0.9, size],
    [-size * 0.7, -size * 0.4, size * 0.75],
    [size * 0.7, -size * 0.5, size * 0.8],
    [0, -size * 0.2, size * 0.8],
  ];
  for (const [bx, by, br] of blobs)
    b.disc(x + bx, gy - 10 + by, br, (xx, yy, d) => {
      const lx = (xx - (x + bx)) / br;
      const ly = (yy - (gy - 10 + by)) / br;
      const lit = -(lx * 0.6 + ly * 0.8) + (r() - 0.5) * 0.5;
      return d > 0.93 && (lx > 0 || ly > 0) ? darker(leaf[2], 0.8) : lit > 0.35 ? leaf[0] : lit > -0.25 ? leaf[1] : leaf[2];
    });
}

export const RIDE_W: Record<string, number> = { none: 0, bike: 15, moto: 16, small: 26, nice: 34 };

export function ride(b: Buffer, kind: string, x: number, gy: number, seed: number): void {
  const r = rand(seed);
  const wheel = (wx: number, rad: number, hub: string) => b.disc(wx, gy - rad, rad, (_x, _y, d) => (d < 0.38 ? hub : d < 0.55 ? "#8a8a98" : "#2c2233"));
  if (kind === "small") {
    // a little hatchback, tall in the cabin
    const c = ["#e0645a", "#5a9ad0", "#f2c94c", "#5fb8a8", "#f5f5f5", "#a89ad8"][Math.floor(r() * 6)];
    for (let yy = gy - 15; yy <= gy - 11; yy++) {
      const k = yy - (gy - 15);
      const a = x + 6 - Math.min(2, k);
      const z = x + 16 + k;
      for (let xx = a; xx <= z; xx++) {
        const edge = xx === a || xx === z || yy === gy - 15;
        b.set(xx, yy, edge ? darker(c, 0.62) : xx === x + 11 ? darker(c, 0.8) : (xx + yy) % 6 ? "#bfe3f5" : "#eef8ff");
      }
    }
    for (let yy = gy - 10; yy <= gy - 4; yy++)
      for (let xx = x; xx <= x + 25; xx++) {
        if (yy === gy - 10 && (xx === x || xx === x + 25)) continue;
        b.set(xx, yy, xx === x || xx === x + 25 || yy === gy - 4 ? darker(c, 0.62) : yy === gy - 10 ? mix(c, "#ffffff", 0.3) : xx === x + 12 && yy < gy - 5 ? darker(c, 0.82) : c);
      }
    b.set(x + 25, gy - 8, "#ffe9a8"), b.set(x, gy - 8, "#e0453a"), b.set(x + 14, gy - 8, darker(c, 0.6));
    wheel(x + 6, 3, "#c8c8d0");
    wheel(x + 19, 3, "#c8c8d0");
    return;
  }
  if (kind === "nice") {
    // a long low saloon, glossy, with a chrome line and bright wheels
    const c = ["#2e2e40", "#8a1e2e", "#1e3a6a", "#c8ccd4", "#f2f2f2", "#2e5a4a"][Math.floor(r() * 6)];
    for (let yy = gy - 14; yy <= gy - 10; yy++) {
      const k = yy - (gy - 14);
      const a = x + 10 - k;
      const z = x + 21 + k;
      for (let xx = a; xx <= z; xx++) {
        const edge = xx === a || xx === z || yy === gy - 14;
        b.set(xx, yy, edge ? darker(c, 0.6) : xx === x + 16 ? darker(c, 0.75) : (xx - yy) % 7 ? "#a8d4ee" : "#eef8ff");
      }
    }
    for (let yy = gy - 9; yy <= gy - 4; yy++)
      for (let xx = x; xx <= x + 33; xx++) {
        if (yy === gy - 9 && (xx < x + 2 || xx > x + 31)) continue;
        const shine = yy === gy - 9 ? mix(c, "#ffffff", 0.4) : yy === gy - 7 ? mix(c, "#ffffff", 0.55) : c;
        b.set(xx, yy, xx === x || xx === x + 33 || yy === gy - 4 ? darker(c, 0.55) : shine);
      }
    b.set(x + 33, gy - 8, "#fff6d0"), b.set(x + 32, gy - 8, "#fff6d0"), b.set(x, gy - 8, "#e0453a"), b.set(x + 1, gy - 8, "#e0453a");
    wheel(x + 7, 3.2, "#eef0f4");
    wheel(x + 26, 3.2, "#eef0f4");
    return;
  }
  if (kind === "moto") {
    for (const wx of [x + 2, x + 13]) b.disc(wx, gy - 3, 3, (_x, _y, d) => (d < 0.4 ? "#c8c8d0" : "#2c2233"));
    for (let xx = x + 2; xx < x + 14; xx++) b.set(xx, gy - 6, "#d9534f"), b.set(xx, gy - 7, xx > x + 5 && xx < x + 11 ? "#2c2233" : "#d9534f");
    b.set(x + 13, gy - 8, "#3a3346"), b.set(x + 13, gy - 9, "#3a3346"), b.set(x + 12, gy - 10, "#3a3346");
    return;
  }
  if (kind === "bike") {
    for (const wx of [x + 3, x + 12]) b.disc(wx, gy - 3, 3, (_x, _y, d) => (d > 0.7 ? "#2c2233" : null));
    for (let k = 0; k < 9; k++) b.set(x + 3 + k, gy - 3 - Math.round(k * 0.4), "#3e7fb8");
    b.set(x + 6, gy - 7, "#2c2233"), b.set(x + 7, gy - 7, "#2c2233"), b.set(x + 12, gy - 8, "#2c2233"), b.set(x + 11, gy - 8, "#2c2233");
  }
}

/** The small things round a home that say how people live, set into the free ground from `x1` back
 *  toward `x0`: hens, a water jar and a vegetable patch by a hut; washing on a line by a simple house;
 *  a bench and a lamp by a block; a letterbox and a fence by a house; lamps and clipped shrubs after. */
export function yard(b: Buffer, kind: string, x0: number, x1: number, gy: number, L: Light, seed: number): void {
  const r = rand(seed);
  const items: [number, (x: number) => void][] = [];
  const hen = (x: number) => {
    const c = r() < 0.5 ? "#f5f2ea" : "#b5703f";
    for (let yy = gy - 4; yy < gy - 1; yy++) for (let xx = x; xx < x + 4; xx++) b.set(xx, yy, yy === gy - 4 && xx === x ? null : c);
    b.set(x + 4, gy - 5, c), b.set(x + 4, gy - 6, c), b.set(x + 5, gy - 6, "#f2b705"), b.set(x + 4, gy - 7, "#d9534f");
    b.set(x + 1, gy - 1, "#d98a2a"), b.set(x + 3, gy - 1, "#d98a2a");
  };
  const jar = (x: number) => {
    b.disc(x + 3, gy - 4, 3.2, (xx) => (xx < x + 3 ? "#c8764a" : "#a85a3a"));
    for (let xx = x + 2; xx < x + 5; xx++) b.set(xx, gy - 8, "#8a4a2a");
  };
  const maize = (x: number) => {
    for (let xx = x; xx < x + 16; xx++) b.set(xx, gy, "#8a6a4a");
    for (let i = 0; i < 4; i++) {
      const sx = x + 2 + i * 4;
      const h = 10 + ((i * 5 + seed) % 3);
      for (let yy = gy - h; yy < gy; yy++) b.set(sx, yy, yy < gy - h + 2 ? "#d9b65e" : "#5a9a4a");
      for (let k = 1; k < 4; k++) b.set(sx - k, gy - h + 3 + k, "#6aae5a"), b.set(sx + k, gy - h + 5 + k, "#4e8e46");
      if (i % 2) b.set(sx + 1, gy - h + 4, "#f2c94c"), b.set(sx + 1, gy - h + 5, "#e0b03a");
    }
  };
  const fire = (x: number) => {
    // three stones, a pot on them and a thread of smoke
    for (const sx of [x, x + 4, x + 8]) b.set(sx, gy - 1, "#8a8a92"), b.set(sx + 1, gy - 1, "#6a6a72");
    b.set(x + 3, gy - 2, "#f28c28"), b.set(x + 6, gy - 2, "#f2c94c"), b.set(x + 5, gy - 1, "#d9534f");
    for (let yy = gy - 7; yy < gy - 2; yy++) for (let xx = x + 1; xx < x + 9; xx++) if (!(yy === gy - 7 && (xx === x + 1 || xx === x + 8))) b.set(xx, yy, xx < x + 4 ? "#4a4452" : "#2c2833");
    for (let k = 0; k < 6; k++) b.set(x + 4 + (k % 3 === 1 ? 1 : 0), gy - 9 - k * 2, mix(b.get(x + 4, gy - 9 - k * 2), "#ffffff", 0.55));
  };
  const washing = (x: number) => {
    for (const px of [x, x + 23]) for (let yy = gy - 16; yy < gy; yy++) b.set(px, yy, "#8a6a52");
    for (let xx = x; xx <= x + 23; xx++) b.set(xx, gy - 15 + Math.round(Math.sin(((xx - x) / 23) * Math.PI)), "#6a6a72");
    const cloth = ["#e98a7a", "#7d8fd9", "#f2c94c", "#f5f2ea"];
    for (let i = 0; i < 4; i++) {
      const cx0 = x + 3 + i * 5;
      const top = gy - 14 + Math.round(Math.sin(((cx0 - x) / 23) * Math.PI));
      for (let yy = top; yy < top + 5 + (i % 2) * 2; yy++) for (let xx = cx0; xx < cx0 + 4; xx++) b.set(xx, yy, xx === cx0 + 3 ? darker(cloth[i], 0.85) : cloth[i]);
    }
  };
  const bucket = (x: number) => {
    for (let yy = gy - 5; yy < gy; yy++) for (let xx = x; xx < x + 5; xx++) b.set(xx, yy, xx === x + 4 ? "#6a7a8a" : "#8a9aa8");
    b.set(x + 1, gy - 6, "#4a5a6a"), b.set(x + 3, gy - 6, "#4a5a6a"), b.set(x + 2, gy - 7, "#4a5a6a");
  };
  const lamp = (x: number) => {
    for (let yy = gy - 26; yy < gy; yy++) b.set(x + 1, yy, "#4a4a5a");
    for (let xx = x - 1; xx < x + 4; xx++) b.set(xx, gy - 27, "#4a4a5a");
    b.set(x, gy - 26, L.glow ? "#ffe9a8" : "#e8e4d4"), b.set(x + 1, gy - 26, L.glow ? "#fff6d0" : "#f5f2ea"), b.set(x + 2, gy - 26, L.glow ? "#ffe9a8" : "#e8e4d4");
    if (L.glow) for (let yy = gy - 25; yy < gy - 20; yy++) for (let xx = x - 2; xx < x + 5; xx++) if (bayer(xx, yy) < 0.3) b.set(xx, yy, mix(b.get(xx, yy), "#ffe9a8", 0.5));
  };
  const bench = (x: number) => {
    for (let xx = x; xx < x + 12; xx++) b.set(xx, gy - 5, "#a0704f"), b.set(xx, gy - 8, "#a0704f"), b.set(xx, gy - 4, "#7a5a3a");
    for (const px of [x + 1, x + 10]) for (let yy = gy - 4; yy < gy; yy++) b.set(px, yy, "#4a4a5a");
  };
  const letterbox = (x: number) => {
    for (let yy = gy - 7; yy < gy; yy++) b.set(x + 2, yy, "#7a5a3a");
    for (let yy = gy - 11; yy < gy - 7; yy++) for (let xx = x; xx < x + 6; xx++) b.set(xx, yy, xx === x + 5 ? "#3e6a9a" : "#5a8ac8");
    b.set(x + 5, gy - 12, "#d9534f"), b.set(x + 5, gy - 13, "#d9534f");
  };
  const fence = (x: number) => {
    for (let xx = x; xx < x + 22; xx++) {
      b.set(xx, gy - 5, "#f5f2ea"), b.set(xx, gy - 3, "#e0dcd0");
      if ((xx - x) % 4 === 0) for (let yy = gy - 8; yy < gy; yy++) b.set(xx, yy, yy === gy - 8 ? "#d8d4c8" : "#f5f2ea"), b.set(xx + 1, yy, "#d8d4c8");
    }
  };
  const shrub = (x: number) => {
    for (let yy = gy - 3; yy < gy; yy++) for (let xx = x + 1; xx < x + 7; xx++) b.set(xx, yy, xx === x + 6 ? "#9a6a4a" : "#c8865a");
    b.disc(x + 4, gy - 7, 3.6, (xx, yy) => ((xx + yy) % 3 ? (xx < x + 4 ? "#7cbf6a" : "#5a9a55") : "#8ad07e"));
  };
  if (kind === "hut") items.push([16, maize], [10, fire], [6, jar], [6, hen], [6, hen]);
  else if (kind === "simple") items.push([24, washing], [5, bucket], [6, hen]);
  else if (kind === "apartment") items.push([4, lamp], [12, bench]);
  else if (kind === "house") items.push([6, letterbox], [22, fence]);
  else items.push([4, lamp], [8, shrub], [8, shrub]);
  // as many as fit, spread over the ground rather than bunched by the people
  while (items.length && items.reduce((n, [iw]) => n + iw + 4, 0) > x1 - x0) items.pop();
  if (!items.length) return;
  const gap = Math.min(16, (x1 - x0 - items.reduce((n, [iw]) => n + iw, 0)) / (items.length + 1));
  let x = x1;
  for (const [iw, draw] of items) {
    x -= gap + iw;
    draw(Math.round(x + (r() - 0.5) * gap * 0.4));
  }
}

/** A pram with a hood, a baby looking out under it and a blanket over them; `x` is its left. */
export const PRAM_W = 18;
export function pram(b: Buffer, x: number, gy: number, skin: string, hair: string): void {
  const body = "#7d8fd9";
  // the tub, rounded at the bottom
  for (let yy = gy - 11; yy <= gy - 5; yy++)
    for (let xx = x; xx <= x + 13; xx++) {
      if (yy === gy - 5 && (xx === x || xx === x + 13)) continue;
      b.set(xx, yy, xx === x || xx === x + 13 || yy === gy - 5 ? darker(body, 0.6) : yy === gy - 11 ? mix(body, "#ffffff", 0.35) : yy >= gy - 7 ? darker(body, 0.85) : body);
    }
  // the hood over the back half, ribbed
  for (let yy = gy - 18; yy <= gy - 11; yy++)
    for (let xx = x; xx <= x + 8; xx++) {
      const d = Math.hypot(xx + 0.5 - (x + 8.5), yy + 0.5 - (gy - 10.5));
      if (d > 7.6) continue;
      const rib = Math.floor(Math.atan2(gy - 10.5 - yy, x + 8.5 - xx) / 0.4) % 2;
      b.set(xx, yy, d > 6.7 ? darker(body, 0.55) : rib ? darker(body, 0.78) : darker(body, 0.9));
    }
  // the baby and a blanket
  b.disc(x + 10.5, gy - 12.5, 2.3, skin);
  b.set(x + 9, gy - 15, hair), b.set(x + 10, gy - 15, hair), b.set(x + 11, gy - 15, hair);
  b.set(x + 11, gy - 13, "#1e1626");
  for (let xx = x + 8; xx <= x + 12; xx++) b.set(xx, gy - 11, xx % 2 ? "#f6f1e6" : "#f2b8c6");
  // the handle, and the wheels on a frame
  for (let k = 0; k < 5; k++) b.set(x + 13 + k, gy - 11 - k, "#3a3346");
  b.set(x + 17, gy - 16, "#3a3346"), b.set(x + 16, gy - 16, "#3a3346");
  for (let xx = x + 3; xx <= x + 11; xx++) b.set(xx, gy - 3, "#6a6a78");
  for (const wx of [x + 3, x + 11]) b.disc(wx, gy - 2, 2.4, (_x, _y, d) => (d > 0.6 ? "#2c2233" : "#c8c8d0"));
}

export function boxes(b: Buffer, x: number, gy: number): void {
  const box = (bx: number, by: number, w: number, h: number) => {
    for (let yy = by; yy < by + h; yy++) for (let xx = bx; xx < bx + w; xx++) b.set(xx, yy, xx === bx || yy === by || xx === bx + w - 1 || yy === by + h - 1 ? "#a0704f" : yy === by + 2 ? "#e8d0a0" : "#d4aa72");
  };
  box(x, gy - 9, 11, 9);
  box(x + 11, gy - 7, 9, 7);
  box(x + 3, gy - 16, 9, 7);
}

export function bunting(b: Buffer, x0: number, x1: number, y: number): void {
  const colors = ["#f28ba8", "#ffd166", "#7d8fd9", "#8cc97e", "#e98a7a"];
  for (let x = x0; x <= x1; x++) {
    const sag = Math.round(Math.sin(((x - x0) / Math.max(1, x1 - x0)) * Math.PI) * 4);
    b.set(x, y + sag, "#6a5a7a");
    const i = Math.floor((x - x0) / 6);
    if ((x - x0) % 6 === 1) for (let k = 0; k < 4; k++) for (let j = 0; j < 4 - k; j++) b.set(x + j + Math.floor(k / 2), y + sag + 1 + k, colors[i % colors.length]);
  }
}

export function confetti(b: Buffer, w: number, h: number, seed: number): void {
  const r = rand(seed);
  const colors = ["#f28ba8", "#ffd166", "#7d8fd9", "#8cc97e", "#e98a7a", "#c49bf0"];
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h * 0.55);
    const c = colors[i % colors.length];
    b.set(x, y, c);
    if (i % 2) b.set(x + 1, y + 1, c);
  }
}

export function flowers(b: Buffer, x: number, gy: number): void {
  for (let i = 0; i < 5; i++) {
    const fx = x + i * 2;
    for (let yy = gy - 6 + (i % 2); yy < gy; yy++) b.set(fx, yy, "#5a9a55");
    b.set(fx, gy - 7 + (i % 2), ["#ffffff", "#f28ba8", "#ffd166"][i % 3]);
  }
  for (let xx = x - 1; xx < x + 10; xx++) b.set(xx, gy - 1, "#8a6a8a");
}

export function toys(b: Buffer, x: number, gy: number): void {
  b.disc(x, gy - 3, 3, (_x, yy) => (yy < gy - 3 ? "#e98a7a" : "#f5f5f5"));
  for (let k = 0; k < 6; k++) b.set(x + 6 + k, gy - 1, "#f2c94c");
  b.set(x + 7, gy - 2, "#3e7fb8"), b.set(x + 10, gy - 2, "#3e7fb8");
}

/** Where you work for yourself: a market stall, a shop, a trading front with crates, a workshop, or an office. */
export const BIZ_W: Record<string, number> = { stall: 32, shop: 38, trading: 38, workshop: 40, agency: 34, tech: 34 };
export function business(b: Buffer, type: string, x: number, gy: number, L: Light): void {
  const w = BIZ_W[type] ?? 38;
  const lamp = { glow: L.glow, snow: false, shabby: false };
  const awning = (y: number, c: string) => {
    for (let yy = y; yy < y + 4; yy++) for (let xx = x - 2; xx < x + w + 2; xx++) b.set(xx, yy, Math.floor((xx - x + 8) / 4) % 2 ? c : "#f5f2ea");
    for (let xx = x - 2; xx < x + w + 2; xx += 4) b.set(xx + 2, y + 4, c), b.set(xx + 1, y + 4, c);
  };
  if (type === "stall") {
    awning(gy - 22, "#d9534f");
    for (const px of [x, x + w - 1]) for (let yy = gy - 18; yy < gy; yy++) b.set(px, yy, "#8a5e44");
    for (let yy = gy - 9; yy < gy - 5; yy++) for (let xx = x; xx < x + w; xx++) b.set(xx, yy, yy === gy - 9 ? "#c49270" : "#a0704f");
    for (let i = 0; i < 9; i++) b.disc(x + 3 + i * 3, gy - 11, 1.4, ["#f28c28", "#d9534f", "#8cc97e", "#f2c94c"][i % 4]);
    for (const bx of [x + 3, x + w - 10]) for (let yy = gy - 4; yy < gy; yy++) for (let xx = bx; xx < bx + 7; xx++) b.set(xx, yy, yy === gy - 4 ? "#c49270" : "#a0704f");
    return;
  }
  if (type === "workshop") {
    walls(b, x, gy - 30, w, 30, "#c8c4bc", L, false);
    for (let xx = x - 1; xx < x + w + 1; xx++) b.set(xx, gy - 31, darker("#c8c4bc", 0.6)), b.set(xx, gy - 32, L.snow ? "#ffffff" : "#8a8f98");
    // a roll-up door half open, the work lit inside
    for (let yy = gy - 20; yy < gy; yy++)
      for (let xx = x + 4; xx < x + 26; xx++) b.set(xx, yy, yy < gy - 12 ? ((yy - (gy - 20)) % 2 ? "#9aa0a8" : "#7a808a") : L.glow ? "#e8b860" : "#4a4450");
    for (let xx = x + 8; xx < x + 22; xx += 5) b.set(xx, gy - 3, "#f2c94c"), b.set(xx + 1, gy - 3, "#f2c94c");
    // a gear on the sign
    b.disc(x + 32, gy - 22, 3.2, (xx, yy, d) => (d < 0.4 ? "#c8c4bc" : (xx + yy) % 2 && d > 0.8 ? null : "#5a6a8a"));
    windowPane(b, x + 29, gy - 14, 8, 7, lamp, "#5a6a8a", false);
    return;
  }
  if (type === "agency" || type === "tech") {
    // a small office: two floors of glass
    const frame = type === "tech" ? "#3a4a6a" : "#6a5a4a";
    walls(b, x, gy - 40, w, 40, type === "tech" ? "#dfe6ee" : "#efe6d8", L, false);
    for (let xx = x - 1; xx < x + w + 1; xx++) b.set(xx, gy - 41, darker(frame, 0.8)), b.set(xx, gy - 42, L.snow ? "#ffffff" : frame);
    for (const fy of [gy - 36, gy - 21]) windowPane(b, x + 3, fy, w - 6, 12, { ...lamp, glow: L.glow || type === "tech" }, frame, false);
    for (const fy of [gy - 36, gy - 21]) for (let k = x + 3 + 8; k < x + w - 3; k += 8) for (let yy = fy; yy < fy + 12; yy++) b.set(k, yy, frame);
    door(b, x + (w >> 1) - 4, gy - 9, 9, 9, frame);
    if (type === "tech") for (let yy = gy - 33; yy < gy - 28; yy++) for (let xx = x + 6; xx < x + 12; xx++) b.set(xx, yy, yy === gy - 29 ? "#3a3a48" : "#7fd0f0");
    return;
  }
  // a shop, or a trading front with crates out in front
  const paint = type === "trading" ? "#e0d4bc" : "#e8d8c8";
  walls(b, x, gy - 26, w, 26, paint, L, false);
  awning(gy - 30, type === "trading" ? "#3e7fb8" : "#d9534f");
  windowPane(b, x + 3, gy - 20, 19, 12, lamp, "#5a6a8a", false);
  if (type === "shop") for (let i = 0; i < 5; i++) b.disc(x + 6 + i * 3.4, gy - 10, 1.4, ["#f28c28", "#d9534f", "#8cc97e", "#f2c94c", "#7d8fd9"][i]);
  door(b, x + 25, gy - 18, 9, 18, "#5a6a8a");
  if (type === "trading") {
    for (const [bx, by] of [[x - 1, gy - 6], [x + 6, gy - 6], [x + 2, gy - 11]] as [number, number][])
      for (let yy = by; yy < by + 6; yy++) for (let xx = bx; xx < bx + 7; xx++) b.set(xx, yy, xx === bx || yy === by || xx === bx + 6 || yy === by + 5 ? "#8a5e44" : (xx + yy) % 3 ? "#c49270" : "#a87a54");
  }
}

export function snowfall(b: Buffer, w: number, h: number, seed: number): void {
  const r = rand(seed);
  for (let i = 0; i < w * 0.45; i++) b.set(Math.floor(r() * w), Math.floor(r() * h * 0.85), r() < 0.7 ? "#ffffff" : "#dbe7f2");
}

export function rain(b: Buffer, w: number, h: number, seed: number): void {
  const r = rand(seed);
  for (let i = 0; i < w * 0.7; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    for (let k = 0; k < 3; k++) b.set(x - k, y + k * 2, mix(b.get(x - k, y + k * 2), "#dfe8f2", 0.6));
  }
}

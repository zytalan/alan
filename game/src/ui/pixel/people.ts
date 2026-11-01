// People drawn small: one builder for every age from child to elder, dressed for their work, with
// their own skin and hair. Babies ride in a pram, drawn with the props.

import type { Figure } from "../../engine";
import { mix, sprite, type RGB, type Sprite } from "./buffer";

export const SKIN = ["#f6d5b1", "#d9a066", "#a8713f", "#7a4a2a"];
export const HAIR: Record<Figure["hair"], string> = { black: "#2c2233", brown: "#6b4423", blond: "#d9b13b", red: "#b5532b", gray: "#a4a8b0", white: "#eceef2" };

const TOPS: Record<Figure["outfit"], string[]> = {
  casual: ["#5fb8a8", "#e98a7a", "#f2c94c", "#7d8fd9", "#8cc97e", "#c49bf0"],
  school: ["#f5f5f5"],
  student: ["#7d8fd9", "#e98a7a", "#5a9a6a", "#9a7ac8"],
  office: ["#a8c8f0", "#f5f5f5", "#d8e8c8", "#f0d8c8"],
  suit: ["#2e3a5a", "#3a3a44", "#4a3a5a"],
  medical: ["#5fb8a8", "#7d8fd9"],
  work: ["#7a8aa8", "#8a7a6a"],
  farm: ["#6a9a5a", "#c8664f", "#5a7ab8"],
  apron: ["#f2c94c", "#7d8fd9", "#e98a7a"],
  uniform: ["#2e3a5a", "#3e4a32"],
  retired: ["#c9845a", "#8a9a6a", "#b56a7a", "#6a7aa8"],
};
const TIES = ["#c8463f", "#3e7fb8", "#d9a52a"];

interface Frame {
  H: number;
  head: [number, number, number]; // centre y, radius across, radius down
  crown: [number, number, number];
  eyes: number;
  mouth: number;
  neck: [number, number];
  torso: [number, number];
  arms: [number, number];
  legs: [number, number];
  shoes: [number, number];
  wide: boolean; // a little more round the middle, from forty on
}

const FRAMES: Record<Exclude<Figure["stage"], "baby">, Frame> = {
  child: { H: 26, head: [7.6, 5.0, 5.0], crown: [6.6, 5.7, 5.7], eyes: 8, mouth: 11, neck: [12, 12], torso: [13, 18], arms: [14, 18], legs: [19, 22], shoes: [23, 24], wide: false },
  teen: { H: 31, head: [8.6, 5.0, 5.2], crown: [7.6, 5.8, 6.0], eyes: 9, mouth: 12, neck: [13, 14], torso: [15, 22], arms: [16, 22], legs: [23, 27], shoes: [28, 29], wide: false },
  adult: { H: 34, head: [9.4, 5.4, 5.6], crown: [8.2, 6.2, 6.6], eyes: 10, mouth: 13, neck: [14, 15], torso: [16, 25], arms: [17, 25], legs: [26, 30], shoes: [31, 32], wide: false },
  middle: { H: 34, head: [9.4, 5.4, 5.6], crown: [8.2, 6.2, 6.6], eyes: 10, mouth: 13, neck: [14, 15], torso: [16, 25], arms: [17, 25], legs: [26, 30], shoes: [31, 32], wide: true },
  elder: { H: 34, head: [10.4, 5.4, 5.6], crown: [9.2, 6.2, 6.6], eyes: 11, mouth: 14, neck: [15, 15], torso: [16, 25], arms: [17, 25], legs: [26, 30], shoes: [31, 32], wide: true },
};

export function person(f: Figure): Sprite {
  const F = FRAMES[f.stage === "baby" ? "child" : f.stage];
  const W = 18;
  const g: (string | null)[][] = Array.from({ length: F.H }, () => Array(W).fill(null));
  const put = (x: number, y: number, k: string) => {
    if (x >= 0 && x < W && y >= 0 && y < F.H) g[y][x] = k;
  };
  const span = (y: number, x0: number, x1: number, k: string) => {
    for (let x = x0; x <= x1; x++) put(x, y, k);
  };
  const girl = f.sex === "F";
  const [t0, t1] = F.torso;
  const [l0, l1] = F.legs;
  const narrow = f.stage === "child";

  // legs, or a skirt over them for a schoolgirl
  span(l0, narrow ? 6 : 5, narrow ? 11 : 12, "p");
  for (let y = l0 + 1; y <= l1; y++) {
    span(y, narrow ? 6 : 5, narrow ? 7 : 7, "p");
    span(y, narrow ? 10 : 10, narrow ? 11 : 12, "p");
  }
  if (girl && f.outfit === "school") {
    for (let y = l0; y <= Math.min(l1, l0 + 2); y++) span(y, narrow ? 5 : 4, narrow ? 12 : 13, "p");
    for (let y = l0 + 3; y <= l1; y++) {
      span(y, narrow ? 6 : 5, 7, "s");
      span(y, 10, narrow ? 11 : 12, "s");
    }
  }
  for (let y = F.shoes[0]; y <= F.shoes[1]; y++) {
    span(y, narrow ? 5 : 4, 7, "f");
    span(y, 10, narrow ? 12 : 13, "f");
  }
  // body and arms
  for (let y = t0; y <= t1; y++) {
    const [a, b] = y === t0 ? (narrow ? [6, 11] : [6, 11]) : F.wide && y >= t0 + 4 ? [4, 13] : narrow ? [6, 11] : [5, 12];
    span(y, a, b, "c");
  }
  const [ax, bx] = narrow ? [5, 12] : [4, 13];
  for (let y = F.arms[0]; y <= F.arms[1] - 2; y++) {
    put(ax - (F.wide && y >= t0 + 4 ? 0 : 0), y, "c");
    put(bx, y, "c");
  }
  for (let y = F.arms[1] - 1; y <= F.arms[1]; y++) {
    put(ax, y, "s");
    put(bx, y, "s");
  }
  for (let y = F.neck[0]; y <= F.neck[1]; y++) span(y, 8, 9, "s");
  // head
  const [hc, hrx, hry] = F.head;
  for (let y = 0; y < F.H; y++)
    for (let x = 0; x < W; x++) if (((x + 0.5 - 9) / hrx) ** 2 + ((y + 0.5 - hc) / hry) ** 2 <= 1) put(x, y, "s");
  // hair: a crown, a fringe, and locks to the shoulders for long hair
  const [cc, crx, cry] = F.crown;
  const e = F.eyes;
  for (let y = 0; y <= e - 3; y++)
    for (let x = 0; x < W; x++) if (((x + 0.5 - 9) / crx) ** 2 + ((y + 0.5 - cc) / cry) ** 2 <= 1) put(x, y, "h");
  for (const x of [4, 5, 6, 11, 12, 13]) put(x, e - 2, "h");
  for (const x of [4, 5, 12, 13]) put(x, e - 1, "h");
  const long = girl && f.stage !== "elder";
  const bald = !girl && f.stage === "elder" && f.shirt % 2 === 0;
  if (bald) for (let y = 0; y <= e - 2; y++) for (let x = 5; x <= 12; x++) if (g[y][x] === "h") g[y][x] = "s";
  if (long) {
    for (let y = e - 2; y <= t0 + 1; y++) {
      put(3, y, "h");
      put(14, y, "h");
      if (y >= e) {
        put(4, y, "h");
        put(13, y, "h");
      }
    }
  } else {
    put(3, e - 1, "h");
    put(14, e - 1, "h");
  }
  if (girl && f.stage === "elder") {
    // short and set, with curls at the sides down to the cheeks
    for (let y = e - 2; y <= e + 1; y++) put(3, y, "h"), put(14, y, "h");
    for (let y = e - 1; y <= e; y++) put(4, y, "h"), put(13, y, "h");
  }
  // face, the eyes a little darker than any skin
  put(6, e, "e");
  put(6, e + 1, "e");
  put(11, e, "e");
  put(11, e + 1, "e");
  put(5, e + 2, "b");
  put(12, e + 2, "b");
  put(8, F.mouth, "m");
  put(9, F.mouth, "m");

  // what they wear over the body
  const top = TOPS[f.outfit][f.shirt % TOPS[f.outfit].length];
  const colors: Record<string, string | RGB> = {
    s: SKIN[f.skin], h: HAIR[f.hair], e: "#1e1626", b: f.skin >= 2 ? mix(SKIN[f.skin], "#d8503e", 0.4) : "#f0907a", m: f.skin >= 2 ? "#4a2430" : "#b55a54",
    c: top, p: f.outfit === "medical" ? TOPS.medical[f.shirt % 2] : f.outfit === "suit" || f.outfit === "uniform" ? top : f.outfit === "retired" ? "#a89a7a" : f.outfit === "school" ? "#3e4a72" : "#4a5a8a",
    f: f.outfit === "suit" ? "#2c2233" : "#5a3c32", w: "#f5f2ea", y: "#f2b705", t: TIES[f.shirt % TIES.length], k: "#3a3346", q: "#8a5a3c", g: "#a2a6b8", r: "#e8d08a",
  };
  const mid = (y: number) => span(y, 8, 9, "w");
  switch (f.outfit) {
    case "suit":
      for (let y = t0; y <= t0 + 5; y++) mid(y);
      for (let y = t0 + 1; y <= t0 + 6; y++) put(8, y, "t"), put(9, y, "t");
      break;
    case "medical":
      for (let y = t0; y <= t1; y++) span(y, y === t0 ? 6 : 5, y === t0 ? 11 : 12, "w");
      for (let y = F.arms[0]; y <= F.arms[1] - 2; y++) put(ax, y, "w"), put(bx, y, "w");
      for (let y = t0; y <= t0 + 3; y++) span(y, 8, 9, "c");
      break;
    case "work":
      for (let y = t0 + 1; y <= t1; y++) span(y, 6, 11, "y");
      span(t0 + 5, 6, 11, "w");
      break;
    case "farm":
      for (let y = t0; y <= t1; y++) for (let x = 4; x <= 13; x++) if (g[y][x] === "c" && (x + y) % 3 === 0) put(x, y, "C");
      break;
    case "apron":
      for (let y = t0 + 2; y <= l0 + 2; y++) span(y, 6, 11, "w");
      put(6, t0, "w"), put(11, t0, "w"), put(6, t0 + 1, "w"), put(11, t0 + 1, "w");
      break;
    case "uniform":
      for (const dy of [2, 4, 6]) put(9, t0 + dy, "y");
      break;
    case "retired":
      for (let y = t0; y <= t0 + 3; y++) mid(y);
      break;
    case "school":
      for (let y = t0; y <= t1; y++) span(y, y === t0 ? 6 : narrow ? 6 : 5, y === t0 ? 11 : narrow ? 11 : 12, "w");
      put(7, t0, "p"), put(10, t0, "p");
      break;
    case "student":
      span(t0, 6, 11, "C");
      break;
  }
  // light from the upper left: shade the right side, catch a highlight on the left
  for (let y = 0; y < F.H; y++)
    for (let x = 0; x < W; x++) {
      const k = g[y][x];
      if (k === "s" && x >= 12 && y < F.neck[0]) g[y][x] = "S";
      else if (k === "c" && x >= 11) g[y][x] = "C";
      else if (k === "c" && x <= 6 && y <= t0 + 3) g[y][x] = "X";
      else if (k === "p" && x >= 10) g[y][x] = "P";
      else if (k === "w" && x >= 11) g[y][x] = "W";
      else if (k === "h" && girl && f.stage === "elder" && (x + 2 * y) % 4 === 0) g[y][x] = "H";
      else if (k === "h" && x >= 4 && x <= 8 && y >= 1 && y <= 3 && (x + y) % 3 !== 0) g[y][x] = "H";
    }
  Object.assign(colors, {
    S: mix(colors.s, "#5a3a5a", 0.16), C: mix(colors.c, "#2a1e3a", 0.2), X: mix(colors.c, "#ffffff", 0.2), P: mix(colors.p, "#2a1e3a", 0.2),
    W: mix(colors.w, "#8a8aa8", 0.2), H: mix(colors.h, "#ffffff", 0.28),
  });

  // extras
  const cap = (k: string, brim: boolean) => {
    const top = Math.max(0, Math.round(cc - cry));
    for (let y = top; y <= top + 2; y++) span(y, 4, 13, k);
    if (brim) span(top + 3, 2, 15, k);
  };
  for (const x of f.extras) {
    if (x === "hardhat") cap("y", false), span(Math.max(0, Math.round(cc - cry)) + 3, 3, 14, "y");
    if (x === "strawhat") cap("r", true);
    if (x === "cap") cap("c", false), span(Math.max(0, Math.round(cc - cry)) + 3, 5, 15, "k");
    if (x === "gradcap") {
      const top = Math.max(0, Math.round(cc - cry));
      span(top, 3, 14, "k"), span(top + 1, 6, 11, "k"), put(14, top + 1, "y"), put(14, top + 2, "y");
    }
    if (x === "glasses") {
      for (const gx of [5, 10]) {
        span(e - 1, gx, gx + 2, "g");
        span(e + 2, gx, gx + 2, "g");
        for (let y = e; y <= e + 1; y++) put(gx, y, "g"), put(gx + 2, y, "g");
      }
      put(8, e, "g"), put(9, e, "g");
    }
    if (x === "backpack") for (let y = t0; y <= t0 + 4; y++) put(6, y, "q"), put(11, y, "q");
    if (x === "bandage") put(ax, F.arms[0] + 2, "w"), put(ax, F.arms[0] + 3, "w");
    if (x === "cane") {
      for (let y = F.arms[1] - 1; y < F.H - 1; y++) put(16, y, "k");
      put(15, F.arms[1] - 1, "k");
    }
  }
  return sprite(g, colors, "ebmgkqty", 0.55);
}

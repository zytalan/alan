// Draw the picture of a life at several ages onto one PNG, to look at how the scene changes.
// Usage: npx tsx scripts/storyboard.ts out.png <ISO> <birthYear> <seed> <familyPct> [<ISO> <birthYear> <seed> <familyPct> ...]
//        npx tsx scripts/storyboard.ts out.png seed <seed> [seed <seed> ...]

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createLife } from "../src/engine/life";
import { newGame, runLife, typical } from "../src/engine/policy";
import { randomLifestyle } from "../src/engine/report";
import { sceneOf, type Figure, type Scene } from "../src/engine/scene";
import type { LifeState } from "../src/engine/types";
import { setWorld } from "../src/engine/world";
import { paintScene } from "../src/ui/pixel/paint";
import { person } from "../src/ui/pixel/people";

setWorld(JSON.parse(readFileSync(new URL("../public/data/world.json", import.meta.url), "utf8")));

const W = 200;
const H = 100;
const AGES = [0, 2, 5, 9, 13, 16, 19, 23, 27, 31, 36, 42, 48, 55, 62, 68, 74, 80, 86, 92, 98];
const COLS = 6;
const SCALE = 2;
const GAP = 6;

function crc32(b: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, (o += p.length) - p.length);
  return out;
}

// a 3x5 font for the age labels
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];

function lifeFrames(s: LifeState): { age: number; sc: Scene }[] {
  const frames: { age: number; sc: Scene }[] = [];
  let last: { age: number; sc: Scene } | null = null;
  runLife(s, typical, (t) => {
    const cur = { age: t.age, sc: sceneOf(t) };
    if (AGES.includes(t.age)) frames.push(cur);
    last = cur;
    return false;
  });
  const end = last as { age: number; sc: Scene } | null;
  if (end && frames[frames.length - 1]?.age !== end.age) frames.push(end);
  return frames;
}

const [out = "storyboard.png", ...rest] = process.argv.slice(2);
if (rest[0] === "sprites") {
  // every stage, both sexes, each skin and hair, and every outfit, eight times their size
  const Z = 8;
  const stages = ["child", "teen", "adult", "middle", "elder"] as const;
  const outfits = ["casual", "school", "student", "office", "suit", "medical", "work", "farm", "apron", "uniform", "retired"] as const;
  const hairs = ["black", "brown", "blond", "red", "gray", "white"] as const;
  const figs: Figure[][] = [];
  for (const sex of ["F", "M"] as const) {
    figs.push(stages.map((stage, i) => ({ role: "you", stage, sex, skin: i % 4, hair: stage === "elder" ? "white" : stage === "middle" ? "gray" : hairs[i], outfit: stage === "child" || stage === "teen" ? "school" : stage === "elder" ? "retired" : "office", shirt: i, extras: stage === "elder" ? ["cane", "glasses"] : [] })));
    figs.push([0, 1, 2, 3].map((skin) => ({ role: "you", stage: "adult", sex, skin, hair: hairs[skin], outfit: "casual", shirt: skin, extras: [] })));
    figs.push([0, 1, 2, 3].map((skin) => ({ role: "you", stage: "elder", sex, skin, hair: skin % 2 ? "gray" : "white", outfit: "retired", shirt: skin, extras: [] })));
    figs.push(outfits.map((outfit, i) => ({ role: "you", stage: "adult", sex, skin: i % 4, hair: hairs[i % 4], outfit, shirt: i, extras: outfit === "work" ? ["hardhat"] : outfit === "farm" ? ["strawhat"] : outfit === "uniform" ? ["cap"] : outfit === "student" ? ["backpack"] : [] })));
  }
  const cell = 20 * Z;
  const sw = Math.max(...figs.map((r) => r.length)) * cell + 8;
  const sh = figs.length * (36 * Z + 8) + 8;
  const sheet = new Uint8Array(sw * sh * 4);
  for (let i = 0; i < sheet.length; i += 4) sheet.set([200, 222, 190, 255], i);
  figs.forEach((row, ry) =>
    row.forEach((f, rx) => {
      const sp = person(f);
      const oy = 8 + ry * (36 * Z + 8) + (36 - sp.length) * Z;
      const ox = 8 + rx * cell;
      sp.forEach((line, y) =>
        line.forEach((c, x) => {
          if (!c) return;
          for (let yy = 0; yy < Z; yy++) for (let xx = 0; xx < Z; xx++) sheet.set([c[0], c[1], c[2], 255], ((oy + y * Z + yy) * sw + ox + x * Z + xx) * 4);
        }),
      );
    }),
  );
  writeFileSync(out, png(sw, sh, sheet));
  console.log(`wrote ${out}`);
  process.exit(0);
}
const lives: LifeState[] = [];
for (let i = rest[0] === "kinds" ? rest.length : 0; i < rest.length; ) {
  if (rest[i] === "seed") {
    const seed = Number(rest[i + 1]);
    const s = newGame({ mode: "random", seed });
    s.lifestyle = randomLifestyle(seed);
    lives.push(s);
    i += 2;
  } else {
    const [iso, by, seed, fam] = rest.slice(i, i + 4);
    lives.push(createLife({ mode: "random", seed: Number(seed), country: iso, birthYear: Number(by), familyPct: Number(fam) }));
    i += 4;
  }
}

const rows: { age: number; sc: Scene }[][] = [];
const FW = Number(process.env.W ?? W);
if (rest[0] === "kinds") {
  // every home, business, climate and weather, ride and prop, on made-up scenes
  const you = (o: Partial<Figure> = {}): Figure => ({ role: "you", stage: "adult", sex: "F", skin: 1, hair: "brown", outfit: "office", shirt: 1, extras: [], ...o });
  const base: Scene = { climate: "temperate", hour: "day", weather: "clear", home: { kind: "house", owned: true, shabby: false }, business: null, ride: "none", figures: [you()], props: [], seed: 7, caption: "" };
  const mk = (o: Partial<Scene>, age = 30) => ({ age, sc: { ...base, ...o } });
  rows.push((["hut", "simple", "apartment", "house", "big", "villa"] as const).map((kind, i) => mk({ home: { kind, owned: true, shabby: false }, seed: 11 + i }, i)));
  rows.push((["stall", "shop", "trading", "workshop", "agency", "tech"] as const).map((type, i) => mk({ home: { kind: i < 3 ? "simple" : "house", owned: true, shabby: false }, business: { type, name: "x" }, figures: [you({ outfit: "apron" })], seed: 3 + i }, i)));
  rows.push([
    mk({ climate: "tropical", home: { kind: "simple", owned: false, shabby: true } }, 0),
    mk({ climate: "arid", home: { kind: "hut", owned: true, shabby: false } }, 1),
    mk({ climate: "cold", weather: "snow", ride: "small" }, 2),
    mk({ weather: "rain", ride: "moto", figures: [you({ stage: "middle", extras: ["bandage"] })] }, 3),
    mk({ hour: "golden", ride: "nice", home: { kind: "big", owned: true, shabby: false }, figures: [you({ stage: "elder", hair: "white", outfit: "retired", extras: ["glasses"] }), { ...you({ stage: "elder", hair: "gray", outfit: "retired" }), role: "partner", sex: "M", skin: 0 }] }, 4),
    mk({ hour: "dusk", ride: "bike", figures: [you({ stage: "elder", hair: "white", outfit: "retired", extras: ["cane"] })] }, 5),
  ]);
  const fam: Figure[] = [{ ...you(), role: "partner", sex: "M", hair: "black", outfit: "casual" }, you(), { ...you({ stage: "child", outfit: "school" }), role: "child" }, { ...you({ stage: "baby", outfit: "casual" }), role: "child" }];
  rows.push([
    mk({ props: ["bunting"], figures: fam.slice(0, 2), ride: "small" }, 0),
    mk({ props: ["confetti"], figures: [you({ extras: ["gradcap"] })] }, 1),
    mk({ props: ["boxes"], home: { kind: "apartment", owned: false, shabby: false }, figures: fam.slice(0, 2) }, 2),
    mk({ props: ["flowers"], weather: "rain", figures: [you({ stage: "middle" })] }, 3),
    mk({ props: ["toys"], figures: fam, ride: "nice", home: { kind: "villa", owned: true, shabby: false } }, 4),
    mk({ props: ["toys"], figures: [...fam, { ...you({ stage: "teen", outfit: "school" }), role: "child", sex: "M" }], ride: "small", home: { kind: "big", owned: true, shabby: false } }, 5),
  ]);
}
for (const s of lives) {
  const f = lifeFrames(s);
  console.log(`\n${s.name}, born ${s.birthYear} in ${s.birthCountry} (family ${(s.familyPct * 100).toFixed(0)}%), ${f.length} frames`);
  for (const x of f) console.log(`  ${String(x.age).padStart(3)} ${x.sc.hour.padEnd(9)} ${x.sc.weather.padEnd(6)} ${x.sc.home.kind}${x.sc.home.owned ? "*" : ""}${x.sc.home.shabby ? " shabby" : ""} ride:${x.sc.ride} [${x.sc.figures.map((g) => `${g.role}:${g.stage}:${g.outfit}${g.extras.length ? "+" + g.extras.join("+") : ""}`).join(" ")}] ${x.sc.props.join(",")}\n      ${x.sc.caption}`);
  for (let k = 0; k < f.length; k += COLS) rows.push(f.slice(k, k + COLS));
  rows.push([]);
}
if (lives.length) rows.pop();

const cw = FW * SCALE;
const ch = H * SCALE;
const sw = COLS * (cw + GAP) + GAP;
const lineH = (r: { age: number }[]) => (r.length ? ch + GAP : 14);
const sh = rows.reduce((n, r) => n + lineH(r), GAP);
const sheet = new Uint8Array(sw * sh * 4);
for (let i = 0; i < sheet.length; i += 4) sheet.set([246, 241, 232, 255], i);
let oy = GAP;
for (const r of rows) {
  r.forEach(({ age, sc }, k) => {
    const b = paintScene(sc, FW);
    const ox = GAP + k * (cw + GAP);
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const si = ((y / SCALE | 0) * FW + (x / SCALE | 0)) * 4;
        sheet.set([b.data[si], b.data[si + 1], b.data[si + 2], 255], ((oy + y) * sw + ox + x) * 4);
      }
    // the age, small, on a pale plate in the corner
    const txt = String(age);
    const pw = txt.length * 8 + 6;
    for (let y = 0; y < 16; y++) for (let x = 0; x < pw; x++) sheet.set([255, 252, 244, 255], ((oy + 4 + y) * sw + ox + 4 + x) * 4);
    [...txt].forEach((d, j) => {
      const g = DIGITS[Number(d)];
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++)
          if (g[gy * 3 + gx] === "1")
            for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) sheet.set([60, 44, 70, 255], ((oy + 7 + gy * 2 + yy) * sw + ox + 7 + j * 8 + gx * 2 + xx) * 4);
    });
  });
  oy += lineH(r);
}
writeFileSync(out, png(sw, sh, sheet));
console.log(`\nwrote ${out} (${sw}x${sh})`);

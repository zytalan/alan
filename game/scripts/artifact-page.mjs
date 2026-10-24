// Turn dist/index.html into the body-only page the claude.ai artifact host expects
// (it supplies <html>/<head>/<body> itself). Run after `vite build`.

import { readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1];
const fonts = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)?.[1];
if (!js || !css) throw new Error("Couldn't find the built script and stylesheet in dist/index.html");

const page = `<title>Lot in Life</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts ? `<link rel="stylesheet" href="${fonts}">` : ""}
<link rel="stylesheet" href="${css}">
<div id="root"></div>
<script type="module" src="${js}"></script>
`;
writeFileSync(new URL("artifact.html", dist), page);
console.log(JSON.stringify({ page: "dist/artifact.html", js, css }));

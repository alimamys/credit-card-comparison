// Bundle the production build into ONE self-contained HTML fragment (inline CSS + JS),
// suitable for hosts that only accept a single page. Usage: node scripts/build-artifact.mjs <out.html>
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "dist/tapwise-single.html";
const assets = join("dist", "assets");
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
const safeJs = js.replace(/<\/script/gi, "<\\/script");
const safeCss = css.replace(/<\/style/gi, "<\\/style");

writeFileSync(
  out,
  `<title>TapWise UAE</title>
<meta name="description" content="Which card in your wallet should you tap right now? Compare the AED value of cashback, miles, points and live deals across your own UAE credit cards.">
<style>${safeCss}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`,
);
console.log(`wrote ${out} (${(css.length + js.length) / 1024 | 0} KB)`);

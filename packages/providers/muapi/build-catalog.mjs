/**
 * Regenerate data/models.json from arcanea-studio's models.js (the source of
 * truth for the muapi model set). Run: node scripts/build-catalog.mjs [path]
 */
import { pathToFileURL } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src =
  process.argv[2] ||
  resolve(here, "..", "..", "arcanea-studio", "src", "lib", "models.js");

const m = await import(pathToFileURL(src).href);

const pick = (arr = []) =>
  arr.map((x) => ({
    id: x.id,
    name: x.name,
    endpoint: x.endpoint,
    category: x.category,
    aspect_ratios: x.inputs?.aspect_ratio?.enum,
    resolutions: x.inputs?.resolution?.enum,
    durations: x.inputs?.duration?.enum,
  }));

const catalog = {
  t2i: pick(m.t2iModels),
  i2i: pick(m.i2iModels),
  t2v: pick(m.t2vModels),
  i2v: pick(m.i2vModels),
  v2v: pick(m.v2vModels),
  lipsync: pick(m.lipsyncModels),
};

mkdirSync(resolve(here, "..", "data"), { recursive: true });
writeFileSync(
  resolve(here, "..", "data", "models.json"),
  JSON.stringify(catalog)
);
console.log(
  "catalog:",
  Object.entries(catalog)
    .map(([k, v]) => `${k}:${v.length}`)
    .join(", ")
);

#!/usr/bin/env node
/**
 * Refresh the vendored AI crawler dataset.
 *
 *   node scripts/update-ai-crawlers.mjs
 *
 * The list comes from ai-robots-txt/ai.robots.txt, which is community
 * maintained with dozens of contributors and updated as new agents appear.
 * Keeping a hand-written roster here instead was already wrong within an hour
 * of writing it: two agents named in our own robots.txt were missing from it.
 *
 * The snapshot is committed rather than fetched at run time so the checker
 * works offline, stays deterministic, and so any change to the roster shows up
 * in a diff and gets reviewed rather than arriving silently.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json";
const TARGET = fileURLToPath(new URL("./data/ai-crawlers.json", import.meta.url));

const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`Could not fetch the dataset: HTTP ${response.status}`);
  process.exit(1);
}

const data = await response.json();
const count = Object.keys(data).length;

// A drastically smaller list means the upstream format changed or the fetch
// returned something unexpected; overwriting on that would quietly gut the
// roster the checker is built from.
if (count < 50) {
  console.error(`Refusing to write: only ${count} agents, expected many more.`);
  process.exit(1);
}

writeFileSync(TARGET, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
console.log(`Wrote ${count} agents to scripts/data/ai-crawlers.json`);
console.log(`Source: ${SOURCE}`);

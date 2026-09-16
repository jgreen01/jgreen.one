#!/usr/bin/env node
/**
 * Prints `<key>\t<tokens>` for every Markdown file in ./dist.
 *
 * The deploy writes these onto the S3 objects as user metadata, and the
 * viewer-response function renames them to `x-markdown-tokens`. The count has
 * to be produced here because it differs per document, and neither a
 * CloudFront response headers policy (fixed values) nor a function at the edge
 * (no access to the body) can work it out.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { estimateTokens } from "./lib/tokens.mjs";

const DIST = "dist";

// This exists to be piped. A consumer that stops reading early (`head`, or a
// shell loop that breaks) closes the pipe, and an unhandled EPIPE would turn
// that into a crash and a misleading deploy failure.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(full);
    else if (entry.name.endsWith(".md")) yield full;
  }
}

for (const file of markdownFiles(DIST)) {
  const key = relative(DIST, file).split("\\").join("/");
  process.stdout.write(`${key}\t${estimateTokens(readFileSync(file, "utf-8"))}\n`);
}

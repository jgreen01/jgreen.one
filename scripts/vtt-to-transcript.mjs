#!/usr/bin/env node
/**
 * Turns a YouTube caption track into a readable transcript for the
 * `transcripts` collection.
 *
 * All the logic lives in scripts/lib/vtt.mjs, which is unit-tested against a
 * real caption excerpt. This file is argument handling and file IO.
 *
 * Every input for a talk sits beside the Markdown it produces and shares its
 * basename, so regenerating needs one path and nothing else:
 *
 *   ./scripts/vtt-to-transcript.mjs \
 *     --out src/content/transcripts/a-practical-workflow.md
 *
 *   a-practical-workflow.vtt              the caption source
 *   a-practical-workflow.corrections.json talk-specific fixes, reapplied
 *   a-practical-workflow.md               frontmatter kept, body regenerated
 *
 * The caption file is committed, so this is reproducible from a clean checkout
 * with no network. To capture one for a new talk (prefer the corrected track
 * over the auto-generated one — the words are already right, only the
 * presentation needs work):
 *
 *   yt-dlp --skip-download --write-subs --sub-langs en --sub-format vtt \
 *     -o "talk.%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"
 *
 * Usage:
 *   ./scripts/vtt-to-transcript.mjs [input.vtt] [--out FILE] [--video-id ID]
 *                                   [--corrections FILE] [--max-words N]
 *
 *   input.vtt      caption file. Defaults to --out's .vtt sibling.
 *   --out          write into this file, preserving its frontmatter. Without
 *                  it the transcript body goes to stdout.
 *   --video-id     YouTube id for the timestamp links. Read from --out's
 *                  frontmatter when omitted.
 *   --corrections  literal [find, replace] pairs. Defaults to --out's
 *                  .corrections.json sibling.
 *   --max-words    paragraph length target (default 85).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  vttToTranscript,
  replaceMarkdownBody,
  applyCorrections,
  siblingPath,
} from "./lib/vtt.mjs";

const die = (message) => {
  console.error(`vtt-to-transcript: ${message}`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const USAGE =
  "usage: vtt-to-transcript.mjs [input.vtt] [--out FILE] [--video-id ID] " +
  "[--corrections FILE] [--max-words N]";

if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(argv.length === 0 ? 1 : 0);
}

const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const out = flag("out");
const maxWords = Number(flag("max-words") ?? 85);

// A leading argument is the caption file; otherwise take --out's .vtt sibling.
const positional = argv[0]?.startsWith("--") ? undefined : argv[0];
const input = positional ?? (out ? siblingPath(out, ".vtt") : undefined);

if (!input) die(`no caption file given and no --out to infer one from.\n${USAGE}`);
if (!existsSync(input)) {
  die(
    positional
      ? `no such file: ${input}`
      : `expected a caption file beside the transcript at ${input} — ` +
          `pass one explicitly, or capture it with yt-dlp (see the header of this script).`,
  );
}
if (!Number.isInteger(maxWords) || maxWords <= 0) die("--max-words must be a positive integer");

// Fall back to the id already recorded in the target's frontmatter, so a
// regeneration does not need the id repeated on the command line.
let videoId = flag("video-id");
if (!videoId && out && existsSync(out)) {
  videoId = /^videoId:\s*["']?([\w-]+)["']?\s*$/m.exec(readFileSync(out, "utf8"))?.[1];
}
if (!videoId) {
  die("--video-id is required (or point --out at a file whose frontmatter has videoId)");
}

// Talk-specific corrections, reapplied on every run so a regeneration never
// loses them. Found beside the target file unless pointed elsewhere.
const correctionsPath =
  flag("corrections") ?? (out ? siblingPath(out, ".corrections.json") : undefined);

let corrections = [];
if (correctionsPath && existsSync(correctionsPath)) {
  try {
    corrections = JSON.parse(readFileSync(correctionsPath, "utf8"));
  } catch (error) {
    die(`could not parse ${correctionsPath}: ${error.message}`);
  }
  if (!Array.isArray(corrections)) die(`${correctionsPath} must be an array of [find, replace]`);
}

const generated = vttToTranscript(readFileSync(input, "utf8"), { videoId, maxWords });
const { text: body, applied, unused } = applyCorrections(generated, corrections);

const paragraphs = body.trim() ? body.trim().split(/\n{2,}/).length : 0;
if (paragraphs === 0) die(`${input} produced no transcript — is it a WEBVTT file?`);

// A correction that stopped matching means the caption track moved underneath
// it. Silently dropping it would let the transcript drift back.
for (const [find] of unused) {
  console.warn(`vtt-to-transcript: correction no longer matches: ${JSON.stringify(find)}`);
}

if (!out) {
  process.stdout.write(body);
} else {
  const existing = existsSync(out) ? readFileSync(out, "utf8") : "";
  writeFileSync(out, existing ? replaceMarkdownBody(existing, body) : body);
  const kept = existing.startsWith("---") ? ", frontmatter preserved" : "";
  const fixed =
    corrections.length > 0 ? `, ${applied.length}/${corrections.length} corrections` : "";
  console.log(
    `vtt-to-transcript: wrote ${out} — ${paragraphs} paragraphs, ` +
      `${body.trim().split(/\s+/).length} words${fixed}${kept}.`,
  );
}

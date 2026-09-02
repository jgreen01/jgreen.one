# Talk transcripts

**Date:** 2026-09-01

**Author:** Jon Green

**Status:** published

**Summary:** How a recorded talk becomes a transcript page — the caption track
is committed, the Markdown body is generated from it, and the site build never
touches the generator.

## Scope

In scope: adding a transcript for a recorded talk, regenerating one, and fixing
a mis-transcription.

Not in scope: publishing the article itself (see `adding-content.md`), or how
the video and slide files are stored (see `managing-media.md`).

## Two pipelines, and only one runs on every build

This is the thing to understand first, because most of the code is caption
processing and none of it runs when the site builds.

**Generation — manual, occasional.** You run a script. It reads a `.vtt`
caption file and writes the body of a Markdown file.

```
talk.en.vtt  ──▶  scripts/vtt-to-transcript.mjs  ──▶  src/content/transcripts/<slug>.md
(from YouTube)     (scripts/lib/vtt.mjs)               frontmatter preserved,
                   + <slug>.corrections.json           body replaced
```

**The site build — every time.** Astro reads the committed Markdown as a content
collection. It never loads the caption file or the generator.

```
src/content/transcripts/<slug>.md
        │  glob loader + transcriptSchema   (src/content.config.ts)
        ▼
   transcripts collection
        │  pairTranscriptsWithEntries()     ← joins to the article, drops drafts
        ▼
   /entries/<slug>/transcript        the readable page
   /entries/<slug>/transcript.md     the Markdown twin
   /entries/<slug>/captions.vtt      the caption track for the player
   /llms.txt                         a "Transcripts" section
```

The generated Markdown is committed rather than built on demand because the
build would otherwise depend on YouTube being reachable, the text has
hand-authored corrections applied that belong in review, and the same commit
should always produce the same site.

## The files for one talk

| File | Committed | Role |
|---|---|---|
| `src/content/transcripts/<slug>.vtt` | yes | caption source |
| `src/content/transcripts/<slug>.corrections.json` | yes | fixes no generic rule can make |
| `src/content/transcripts/<slug>.md` | yes | **generated** — frontmatter by hand, body by script |
| `public/media/<slug>.mp4` | no — S3 | optional self-hosted mirror |

All three in `src/content/transcripts/` share a basename. That is what lets the
script resolve every input from one `--out` path. The collection glob is
`**/*.md`, so the `.vtt` and `.json` sit there without becoming entries.

## A transcript is not a post

It has no `pubDate` and never appears in a listing. Its frontmatter names the
entry it belongs to:

```yaml
entry: "practical-workflow-for-ai-coding-assistants"
```

The routes build from that pairing, so **a transcript inherits its article's
draft status**. Point one at an unpublished entry and nothing builds — no page,
no `.md`, no captions, no `llms.txt` line. That is deliberate: without it, a
draft could leak out in full through a side door.

## Adding a transcript for a new talk

**1. Capture the caption track.** Prefer the corrected track over the
auto-generated one — the words are already right and only the presentation needs
work.

```bash
yt-dlp --skip-download --write-subs --sub-langs en --sub-format vtt \
  -o "talk.%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"

mv talk.en.vtt src/content/transcripts/<slug>.vtt
```

**2. Write the frontmatter.** Create `src/content/transcripts/<slug>.md` with
frontmatter only. Required: `title`, `description` (160 characters max, same cap
as entries), `entry`, `event`, `recordingUrl`, `videoId`, `recordedDate`,
`durationSeconds`. Optional: `eventUrl`, `slidesUrl`, `repoUrl`, `mirrorUrl`,
`editedNote`.

Keep the "do not hand-edit" note as a YAML comment inside the frontmatter block.
The body is replaced on every run; a warning in the body deletes itself.

**3. Generate the body.**

```bash
./scripts/vtt-to-transcript.mjs --out src/content/transcripts/<slug>.md
```

No caption path and no `--video-id` needed: both are resolved from `--out` —
the `.vtt` sibling and the `videoId` already in the frontmatter.

**4. Verify.** Read the output. Look for false starts the generic rules could
not catch, and add them to the corrections file (below). Then:

```bash
npm run build && npm run check && npm test
```

## Fixing a mis-transcription

**Never edit the body.** The next regeneration overwrites it.

Add a literal find/replace pair to `<slug>.corrections.json` and regenerate:

```json
[
  ["the garbled passage exactly as it appears", "the corrected passage"]
]
```

Matching is literal, not a regular expression, so punctuation needs no escaping.
Pairs apply in order, so a later one can build on an earlier one.

The script reports how many applied — `6/6 corrections` — and **warns about any
that no longer match**. That warning means the caption track changed underneath
the correction, and the text is about to drift back.

## What the generic rules already handle

Don't write a correction for these; they are fixed for every transcript:

- **Restarted words** — `the-- the tool`, `work-- workflow`
- **Repeated words**, across apostrophes and case — `there's there's`, `all All`.
  Whitespace must sit directly between the two, so a sentence boundary
  (`that. That was…`) is never collapsed.
- **Known mis-transcriptions** — Claude Code, Kiro, Pac-Man
- **Speaker attribution**, including one garbled tag the track uses for two
  different people, disambiguated by what was said

Cleanup runs twice: once per caption fragment and again on the joined paragraph.
Captions wrap mid-sentence, so a stutter routinely lands half in one cue and
half in the next, where a pass over either alone cannot see it.

## Captions and the video mirror

If a transcript sets `mirrorUrl`, the page renders a `<video>` with a `<track>`
pointing at `/entries/<slug>/captions.vtt`.

That route serves **the same committed `.vtt` that generated the transcript**,
so the words on the page and the words on the video cannot disagree — there is
only one file. A transcript with no `.vtt` sibling produces no captions route,
and the player falls back to no captions rather than requesting a 404.

The mirror is deliberately secondary to the original recording link. One MP4 with
no adaptive bitrate is a durable fallback, not a better player.

## Commands

```bash
# generate or regenerate a transcript body
./scripts/vtt-to-transcript.mjs --out src/content/transcripts/<slug>.md

# override the defaults if you need to
./scripts/vtt-to-transcript.mjs talk.en.vtt --video-id ID --max-words 85
./scripts/vtt-to-transcript.mjs talk.en.vtt          # body to stdout

npm test              # includes the VTT and transcript unit tests
npm run test:build    # builds a fixture transcript pair and asserts the routes
npm run smoke         # walk the pages in both themes and both viewports
```

## Rules

- **The body is generated.** Fix the corrections file, not the Markdown.
- **The caption file is committed.** Regeneration must work from a clean
  checkout with no network.
- **Corrections are literal strings**, and a stale one is reported rather than
  silently dropped.
- **A transcript follows its article.** No separate publish step, no way to
  publish one whose entry is still a draft.

## Troubleshooting

**`correction no longer matches: "..."`** — the caption track changed under it.
Check whether the passage still needs fixing; update or delete the pair.

**The transcript page 404s** — its article is a draft. That is the intended
behaviour. Set `draft: false` on the entry.

**No captions on the video** — there is no `<slug>.vtt` beside the transcript,
so the route was not generated. The transcript itself is unaffected.

**`expected a caption file beside the transcript at …`** — the `.vtt` sibling is
missing. Pass a path explicitly, or capture one with `yt-dlp`.

**The dev server shows an old version** — Astro caches content. After changing
the schema or adding frontmatter fields, stop the server, `rm -rf .astro`, and
start it again.

**A build test fails looking for `transcript/index.md`** — a transcript's twin is
the sibling `transcript.md`, not an `index.md` inside the directory. The entry
invariant is scoped to entry pages for exactly this reason.

## Related

- `adding-content.md` — writing and publishing the article a transcript attaches to
- `managing-media.md` — how the slide PDF and video mirror are stored and deployed

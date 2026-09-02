/**
 * Turning a YouTube caption track into a readable transcript.
 *
 * Every function here is pure so the awkward parts — speaker attribution and
 * the cleanup rules — can be unit-tested against a real caption excerpt rather
 * than reasoned about. `scripts/vtt-to-transcript.mjs` is the thin CLI wrapper.
 *
 * The input is the *corrected* caption track, not the auto-generated one, so
 * the words are already right. What needs fixing is presentation: captions are
 * wrapped mid-sentence, speaker tags are inconsistent, and spoken false starts
 * that pass unnoticed in the ear are noise on the page.
 */

const TIMING = /^(\d\d):(\d\d):(\d\d)\.(\d+)\s+-->/;
const SPEAKER_TAG = /\[([A-Z][A-Z ]+)\]/;

/** Canonical names for the tags the caption track uses. */
const SPEAKER_ALIASES = {
  "JON GREEN": "Jon Green",
  MODERATOR: "Moderator",
  "AUDIENCE MEMBER": "Audience",
  "AUDIENCE MEMBER ONE": "Audience",
  "AUDIENCE MEMBER TWO": "Audience",
};

/**
 * One garbled tag in the track stands in for two different people: the speaker
 * for almost all of it, and the moderator for the closing hand-back. Nothing in
 * the tag distinguishes them, so the wrap-up is matched on what was said.
 */
const AMBIGUOUS_TAG = "TRUCKER HATCH";
const WRAP_UP = [/^all\s*right[.,]?\s+i think we/i, /^awesome[.,]?\s+thank you/i];

const DEFAULT_SPEAKER = "Jon Green";
const FALLBACK_SPEAKER = "Audience";

/** Words the caption track consistently gets wrong. */
const RENAMES = [
  [/\bcloud\s+code(?:r)?\b/gi, "Claude Code"],
  [/\bkero\b/gi, "Kiro"],
  [/\bpac-?man\b/gi, "Pac-Man"],
  [/\brefrences\b/gi, "references"],
];

/** Parses a WEBVTT document into `{ start, text }` cues, header discarded. */
export function parseVtt(vtt) {
  const cues = [];
  let start = null;
  let lines = [];

  const flush = () => {
    if (start !== null && lines.length > 0) cues.push({ start, text: lines.join(" ") });
    lines = [];
  };

  for (const raw of String(vtt).split(/\r?\n/)) {
    const timing = TIMING.exec(raw);
    if (timing) {
      flush();
      const [, h, m, s, frac] = timing;
      start = Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac}`);
      continue;
    }
    if (start === null) continue; // still in the header
    const line = raw.replace(/<[^>]+>/g, "").trim();
    if (!line) continue;
    // Rolling captions repeat the previous line as the next one scrolls in.
    if (lines[lines.length - 1] === line) continue;
    lines.push(line);
  }
  flush();

  return cues;
}

/** Canonical speaker name for a tag, disambiguating the overloaded one by text. */
export function resolveSpeaker(tag, text = "") {
  const key = String(tag).trim().toUpperCase();
  if (key === AMBIGUOUS_TAG) {
    return WRAP_UP.some((pattern) => pattern.test(String(text).trim()))
      ? "Moderator"
      : DEFAULT_SPEAKER;
  }
  return SPEAKER_ALIASES[key] ?? FALLBACK_SPEAKER;
}

/**
 * Splits cues into `{ start, speaker, text }` fragments.
 *
 * A cue carries a speaker tag only when the speaker changes, so an untagged cue
 * continues whoever was talking.
 */
export function toFragments(cues, { defaultSpeaker = DEFAULT_SPEAKER } = {}) {
  const fragments = [];
  let speaker = defaultSpeaker;

  for (const cue of cues) {
    const parts = String(cue.text).split(new RegExp(SPEAKER_TAG.source, "g"));
    const head = parts[0].trim();
    if (head) fragments.push({ start: cue.start, speaker, text: head });

    for (let i = 1; i < parts.length; i += 2) {
      const body = (parts[i + 1] ?? "").trim();
      speaker = resolveSpeaker(parts[i], body);
      if (body) fragments.push({ start: cue.start, speaker, text: body });
    }
  }

  return fragments;
}

/** Removes spoken false starts and corrects known mis-transcriptions. */
export function cleanTranscriptText(text) {
  let out = String(text);

  // "the-- the tool" and "work-- workflow" are the same disfluency: a word
  // restarted. Keep the completed one.
  out = out.replace(/\b(\w+)--\s*(\w+)/g, (whole, first, second) =>
    second.toLowerCase().startsWith(first.toLowerCase()) ? second : `${first} ${second}`,
  );
  // A word simply said twice. Case-insensitive and apostrophe-aware, because
  // "there's there's" and "all All" are the same disfluency as "the the".
  // Whitespace must sit directly between the two, so a sentence boundary
  // ("that. That was...") is never collapsed.
  out = out.replace(/\b([A-Za-z]+(?:'[A-Za-z]+)?)\s+\1\b/gi, "$1");
  out = out.replace(/--\s*/g, " ");

  for (const [pattern, replacement] of RENAMES) out = out.replace(pattern, replacement);

  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.?!;:])/g, "$1")
    .trim();
}

const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const endsSentence = (text) => /[.?!]["')\]]?$/.test(text.trim());

/**
 * Groups fragments into paragraphs.
 *
 * Breaks whenever the speaker changes, and otherwise at the first sentence end
 * past `maxWords` — so a paragraph is never cut mid-thought, and a monologue
 * does not arrive as one unreadable block.
 */
export function toParagraphs(fragments, { maxWords = 85 } = {}) {
  const paragraphs = [];
  let buffer = [];
  let speaker = null;
  let start = null;

  const flush = () => {
    if (buffer.length > 0) paragraphs.push({ start, speaker, text: buffer.join(" ") });
    buffer = [];
    start = null;
  };

  for (const fragment of fragments) {
    if (speaker !== null && fragment.speaker !== speaker) flush();
    speaker = fragment.speaker;
    if (start === null) start = fragment.start;
    buffer.push(fragment.text);

    const joined = buffer.join(" ");
    if (wordCount(joined) >= maxWords && endsSentence(joined)) flush();
  }
  flush();

  return paragraphs;
}

/** `MM:SS`, or `H:MM:SS` once past an hour. Fractional seconds are floored. */
export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Renders paragraphs as Markdown, each opening with a timestamp that links into
 * the recording at that second — the one thing a transcript of a talk is for,
 * and the reason this is a page rather than a PDF.
 */
export function renderTranscriptBody(paragraphs, { videoId }) {
  let previousSpeaker = null;

  const blocks = paragraphs.map((paragraph) => {
    const seconds = Math.floor(paragraph.start);
    const url = `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
    const stamp = `**[[${formatTimestamp(paragraph.start)}](${url})]**`;
    const label = paragraph.speaker !== previousSpeaker ? ` **${paragraph.speaker}:**` : "";
    previousSpeaker = paragraph.speaker;
    return `${stamp}${label} ${paragraph.text}`;
  });

  return blocks.join("\n\n") + "\n";
}

/**
 * A file sharing a transcript's basename — its caption source, its corrections.
 *
 * Every input for a talk sits beside the Markdown it produces and shares its
 * name, so `--out` alone resolves the whole set. Only a trailing `.md` is
 * stripped, so a directory that happens to end in `.md` is left alone.
 *
 * @param {string} outPath Path to the transcript Markdown file.
 * @param {string} extension Extension to swap in, leading dot included.
 * @returns {string}
 */
export function siblingPath(outPath, extension) {
  return String(outPath).replace(/\.md$/, "") + extension;
}

/**
 * Applies literal find/replace pairs to a rendered transcript.
 *
 * The generic rules above fix disfluencies that follow a pattern. They cannot
 * fix a sentence that collapsed into noise once, and hand-editing the output
 * would be undone by the next regeneration — so those corrections live as data
 * beside the transcript and are reapplied every time.
 *
 * Matching is literal rather than regular-expression, because the passages
 * needing correction are full of punctuation that would otherwise have to be
 * escaped by whoever writes the corrections file.
 *
 * `unused` is the point of the return shape: a correction that stops matching
 * means the upstream caption track changed, and silently dropping it would let
 * the transcript drift back.
 */
export function applyCorrections(text, corrections = []) {
  let out = String(text);
  const applied = [];
  const unused = [];

  for (const pair of corrections) {
    const [find, replace] = pair;
    if (find && out.includes(find)) {
      out = out.split(find).join(replace);
      applied.push(pair);
    } else {
      unused.push(pair);
    }
  }

  return { text: out, applied, unused };
}

/**
 * Swaps the body of a Markdown document, keeping its frontmatter.
 *
 * Regeneration has to be free, or a fixed cleanup rule never makes it back into
 * the published file. Only the document's own opening fence counts as
 * frontmatter — a horizontal rule inside the new body is just content.
 */
export function replaceMarkdownBody(document, body) {
  const text = String(document);
  if (!text.startsWith("---")) return body;

  const fence = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!fence) return body;

  return `${fence[0].replace(/\s+$/, "")}\n\n${body.replace(/^\n+/, "")}`;
}

/**
 * Convenience: caption document in, Markdown transcript body out.
 *
 * @param {string} vtt Raw WEBVTT document.
 * @param {{ videoId: string, maxWords?: number }} options
 * @returns {string}
 */
export function vttToTranscript(vtt, { videoId, maxWords = 85 }) {
  const fragments = toFragments(parseVtt(vtt)).map((fragment) => ({
    ...fragment,
    text: cleanTranscriptText(fragment.text),
  }));

  // Cleaned twice, deliberately. Captions wrap mid-sentence, so a spoken
  // stutter routinely lands with one half in each of two cues — invisible to a
  // pass over either fragment alone, obvious once they are joined.
  const paragraphs = toParagraphs(fragments, { maxWords })
    .map((paragraph) => ({ ...paragraph, text: cleanTranscriptText(paragraph.text) }))
    .filter((paragraph) => paragraph.text.trim());

  return renderTranscriptBody(paragraphs, { videoId });
}

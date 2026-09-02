import { SEO_DEFAULTS } from "./seoMeta";

/** The slice of a transcript these helpers read. */
export interface TranscriptLike {
  id: string;
  collection: string;
  /** Raw Markdown body. Optional because Astro's loader types it that way. */
  body?: string;
  data: {
    title: string;
    description: string;
    entry: string;
    event: string;
    eventUrl?: string;
    recordingUrl: string;
    videoId: string;
    recordedDate: Date;
    durationSeconds: number;
    slidesUrl?: string;
    repoUrl?: string;
    editedNote?: string;
  };
}

/** The slice of an entry a transcript needs in order to attach to it. */
export interface PairableEntry {
  id: string;
  collection: string;
  data: { title: string; draft: boolean };
}

export interface TranscriptPair<
  T extends TranscriptLike = TranscriptLike,
  E extends PairableEntry = PairableEntry,
> {
  transcript: T;
  entry: E;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Runtime in words — "48 minutes", "2 hours 5 minutes".
 *
 * Deliberately coarse. A reader deciding whether to watch wants the shape of
 * the commitment, not the seconds; the timestamps handle precision.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(plural(hours, "hour"));
  if (minutes > 0) parts.push(plural(minutes, "minute"));

  return parts.length > 0 ? parts.join(" ") : "under a minute";
}

/**
 * Joins each transcript to the entry it names, newest recording first.
 *
 * A transcript is not a post in its own right: it exists only as the companion
 * to an article. So it inherits that article's draft status, and a transcript
 * pointing at a missing or unpublished entry simply does not build — which is
 * what stops an unfinished piece leaking out in full through a side door.
 */
export function pairTranscriptsWithEntries<
  T extends TranscriptLike,
  E extends PairableEntry,
>(transcripts: readonly T[], entries: readonly E[]): Array<TranscriptPair<T, E>> {
  const published = new Map(
    entries.filter((entry) => !entry.data.draft).map((entry) => [entry.id, entry]),
  );

  return transcripts
    .flatMap((transcript) => {
      const entry = published.get(transcript.data.entry);
      return entry ? [{ transcript, entry }] : [];
    })
    .sort((a, b) => +b.transcript.data.recordedDate - +a.transcript.data.recordedDate);
}

/** Absolute URL for a managed asset path; external URLs pass through. */
const absolute = (url: string) => (url.startsWith("/") ? `${SEO_DEFAULTS.site}${url}` : url);

/**
 * Renders a transcript as a standalone Markdown document.
 *
 * Same content as the HTML page in a lighter format, matching `entryMarkdown`.
 * The preamble matters more here than it does for an article: a transcript read
 * out of context needs to say whose words these are, when they were spoken, and
 * above all that it was edited — otherwise a lightly-tidied sentence gets quoted
 * as though it were said verbatim.
 */
export function transcriptMarkdown(transcript: TranscriptLike, entry: PairableEntry): string {
  const { data } = transcript;
  const articleUrl = `${SEO_DEFAULTS.site}/entries/${entry.id}`;

  const meta = [
    data.eventUrl ? `Event: [${data.event}](${data.eventUrl})` : `Event: ${data.event}`,
    `Recorded: ${isoDate(data.recordedDate)}`,
    `Runtime: ${formatDuration(data.durationSeconds)}`,
    `Recording: ${data.recordingUrl}`,
    data.slidesUrl ? `Slides: ${absolute(data.slidesUrl)}` : null,
    data.repoUrl ? `Repository: ${data.repoUrl}` : null,
    `Article: ${articleUrl}`,
    `Source: ${articleUrl}/transcript`,
  ].filter(Boolean);

  return [
    `# ${data.title} — transcript`,
    "",
    `> ${data.description}`,
    "",
    meta.join("  \n"),
    ...(data.editedNote ? ["", `_${data.editedNote}_`] : []),
    "",
    "---",
    "",
    (transcript.body ?? "").trim(),
    "",
  ].join("\n");
}

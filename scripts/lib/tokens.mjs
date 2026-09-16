/**
 * Estimating the token count of a Markdown document.
 *
 * Published as `x-markdown-tokens` so an agent can budget context before
 * fetching the body — the header Cloudflare's Markdown for Agents defines.
 *
 * It is an estimate by construction: the true count depends on the tokeniser,
 * which differs per model, and computing a real one at deploy time would mean
 * shipping a tokeniser to do it. Four characters per token is the usual
 * approximation for English prose and is close enough to be useful for sizing,
 * which is all the header is for.
 */
const CHARS_PER_TOKEN = 4;

/** Rough token count for `text`. Zero for empty, whitespace or junk input. */
export function estimateTokens(text) {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return Math.max(1, Math.round(trimmed.length / CHARS_PER_TOKEN));
}

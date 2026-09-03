/**
 * Timing for the footer nazar's idle blink.
 *
 * The eye blinks on its own, on hover, when it first scrolls into view, and on
 * tap. Only the idle rhythm needs a rule worth testing: a fixed interval reads
 * as a machine ticking, while a random one inside a wide range reads as
 * something alive — which is the whole point.
 *
 * The rule lives here so it can be unit-tested; `Base.astro` carries a small
 * inline script that mirrors it, in the same way the copyright script mirrors
 * `copyright.ts`. Keep the two in step.
 */

/** Never faster than this, so the eye is still the vast majority of the time. */
export const BLINK_MIN_MS = 6000;

/** Never slower than this, so it does not read as broken on a long page. */
export const BLINK_MAX_MS = 14000;

/**
 * Milliseconds until the next idle blink.
 *
 * `random` is injectable so the range can be asserted at its edges rather than
 * sampled and hoped over.
 */
export function nextBlinkDelay(random: () => number = Math.random): number {
  return Math.round(BLINK_MIN_MS + random() * (BLINK_MAX_MS - BLINK_MIN_MS));
}

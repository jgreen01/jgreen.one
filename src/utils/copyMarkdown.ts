/**
 * Putting a page's Markdown twin on the clipboard.
 *
 * The established failure of this pattern is a button that silently does
 * nothing: `navigator.clipboard` is absent or rejects — an in-app browser, a
 * WebView, a denied permission — the click is swallowed, and the reader
 * concludes the site is broken. So `copyText` reports whether it worked and
 * never throws, leaving the caller no excuse for saying nothing.
 *
 * Lives here rather than in the component so the branch that matters can be
 * unit-tested against environments that are awkward to reproduce in a browser.
 */

/** Just enough of the platform to copy, so a test can supply a hostile one. */
export interface CopyTarget {
  clipboard?: { writeText(text: string): Promise<void> };
  /** The deprecated path, still the only one some WebViews offer. */
  execCommand?(command: string): boolean;
}

/**
 * Copies text, returning whether it actually happened.
 *
 * Never rejects and never throws: an unhandled rejection here is the dead
 * button this exists to prevent.
 */
export async function copyText(text: string, target: CopyTarget): Promise<boolean> {
  if (target.clipboard?.writeText) {
    try {
      await target.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — a rejection is not the end of the options.
    }
  }

  if (target.execCommand) {
    try {
      return target.execCommand("copy") === true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * A token count for the label, or null when there is nothing trustworthy to
 * show. The twins carry `x-markdown-tokens`, so this costs a header read and
 * tells a reader what the paste will spend.
 */
export function formatTokenCount(tokens: number): string | null {
  if (!Number.isFinite(tokens) || tokens <= 0) return null;
  const rounded = Math.round(tokens);
  return `≈${rounded.toLocaleString("en-US")} token${rounded === 1 ? "" : "s"}`;
}

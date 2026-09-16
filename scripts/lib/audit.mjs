/**
 * Judging a Lighthouse run.
 *
 * Lighthouse is Google's own auditing engine, so its SEO checks are the same
 * reasoning Google applies. That is the whole reason to use it rather than to
 * keep writing checks by hand: it already encodes the edge cases, and it
 * catches the class of bug this site actually shipped.
 *
 * Verified against the real defect: a page naming the homepage as its
 * canonical scores 0 on the `canonical` audit with the explanation "Points to
 * the domain's root URL (the homepage), instead of an equivalent page of
 * content". Both fixtures under tests/fixtures are trimmed recordings of real
 * runs rather than hand-written shapes.
 */

/**
 * Audits that must pass on their own, whatever the category score.
 *
 * A category is an average, so one broken check can hide inside a high score.
 * These are the ones where a failure means the page is misrepresented to a
 * search engine rather than merely imperfect.
 */
export const CRITICAL_AUDITS = [
  "canonical",
  "is-crawlable",
  "http-status-code",
  "document-title",
  "meta-description",
  "viewport",
  "hreflang",
];

/**
 * Audits that may fail without failing the run, each with the reason.
 *
 * An exemption is a claim that Lighthouse is wrong for this site, not that the
 * problem does not matter — so each one needs a justification that outlives
 * whoever added it.
 */
export const EXEMPT_AUDITS = {
  "robots-txt":
    "Lighthouse scores robots.txt 0 for an 'Unknown directive', which it " +
    "reports for the AIPREF Content-Usage rule. RFC 9309 requires the " +
    "opposite: 'Parsing of other records MUST NOT interfere with the parsing " +
    "of explicitly defined records.' A spec-compliant parser reads the file " +
    "correctly — verified with robots-parser, every agent allowed and the " +
    "sitemap intact — so the audit is stricter than the standard rather than " +
    "finding a fault. Remove this exemption once Lighthouse recognises the " +
    "directive, or if the Content-Usage rule is ever dropped.",
};

/** A static site with a handful of pages has no excuse for less than perfect. */
export const CATEGORY_THRESHOLDS = {
  seo: 1,
  "best-practices": 1,
};

/**
 * Scores of null are not failures. Lighthouse uses them for audits that do not
 * apply to the page and for informational ones that are reported but never
 * scored; treating those as zero would fail every run.
 */
const isRealFailure = (audit) =>
  audit &&
  typeof audit.score === "number" &&
  audit.score < 1 &&
  audit.scoreDisplayMode !== "notApplicable" &&
  audit.scoreDisplayMode !== "informative";

/**
 * Findings for one Lighthouse result, empty when the page is sound.
 *
 * Lighthouse's own explanation is quoted rather than paraphrased: it names the
 * specific failure mode, and rewording it would only lose detail.
 */
/**
 * @param {any} lhr
 * @param {{ thresholds?: Record<string, number> }} [options]
 */
export function evaluateLighthouse(lhr, { thresholds = CATEGORY_THRESHOLDS } = {}) {
  const findings = [];
  const audits = lhr.audits ?? {};

  for (const id of CRITICAL_AUDITS) {
    const audit = audits[id];
    if (!isRealFailure(audit)) continue;
    if (id in EXEMPT_AUDITS) continue;
    const why = audit.explanation ? ` — ${audit.explanation}` : "";
    findings.push(`${id}: ${audit.title ?? "failed"}${why}`);
  }

  // A category score is an average over its audits, so an exempt audit drags
  // the number down even though nothing is wrong. Rather than lowering the
  // threshold — which would hide a real regression of the same size — the
  // shortfall is forgiven only when every failing audit is exempt.
  const failing = Object.values(audits).filter(isRealFailure).map((audit) => audit.id);
  const unexplained = failing.filter((id) => !(id in EXEMPT_AUDITS));

  for (const [name, minimum] of Object.entries(thresholds)) {
    const category = (lhr.categories ?? {})[name];
    if (!category || typeof category.score !== "number") continue;
    if (category.score >= minimum) continue;
    if (failing.length > 0 && unexplained.length === 0) continue;

    findings.push(
      `${name} scored ${Math.round(category.score * 100)}, below the required ${Math.round(minimum * 100)}`,
    );
  }

  return findings;
}

/** Roll up a run across several pages. */
export function summarizeAudit(results) {
  const failing = results.filter((r) => r.findings.length > 0);
  return {
    total: results.length,
    passed: results.length - failing.length,
    failed: failing.length,
    affectedUrls: failing.map((r) => r.url),
  };
}

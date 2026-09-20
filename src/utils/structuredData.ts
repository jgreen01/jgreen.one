/**
 * JSON-LD structured data.
 *
 * Open Graph describes how to render a link preview. This describes what a
 * page *is* and who wrote it, in the schema.org vocabulary that Google, Bing,
 * Yandex and Apple maintain jointly.
 *
 * Built against Google Search Central and schema.org V30.0, checked
 * 2026-09-14. Several rules here are not the obvious guess:
 *
 * - There are no required properties. Google: "There are no required
 *   properties; instead, add the properties that apply to your content." So a
 *   property is emitted only when it describes the page truthfully, and
 *   omitted otherwise.
 * - Markup must match visible content. The author is safe to claim because
 *   `ArticleLayout` renders a byline; it was not before that shipped.
 * - `author.name` holds the name alone. The role belongs in `jobTitle`.
 * - Dates need an explicit timezone, or Google substitutes Googlebot's.
 *
 * Lives here rather than in component frontmatter because `.astro` files
 * cannot be unit-tested, and structured data is invisible on the page — a
 * mistake in it survives every visual check.
 */
import { CONTACT } from "./contact";
import { isoDateTime } from "./formatDate";

const SITE = "https://jgreen.one";

/**
 * The author's stable identity.
 *
 * A fragment on the profile page, so the Person nested in an entry and the
 * Person on /about resolve to one entity rather than two people who happen to
 * share a name.
 */
export const AUTHOR_ID = `${SITE}/about/#person`;

const absolute = (path: string): string =>
  /^https?:\/\//i.test(path) ? path : `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;

/** Drop keys whose value is absent, so nothing emits `undefined` or an empty list. */
function present<T extends Record<string, unknown>>(node: T): T {
  return Object.fromEntries(
    Object.entries(node).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      return !(Array.isArray(value) && value.length === 0);
    }),
  ) as T;
}

export interface PersonNode {
  "@type": "Person";
  "@id"?: string;
  name: string;
  url?: string;
  jobTitle?: string;
  sameAs?: string[];
}

/**
 * An author as a Person.
 *
 * The owner gets their full identity: `sameAs` is the property doing the real
 * work, asserting that this author, the GitHub account and the LinkedIn
 * profile are one entity rather than three pages that share a name.
 *
 * Anyone else gets their name alone. Attaching the owner's `@id`, profiles or
 * job title to a different author would merge two people into one entity and
 * claim that someone else's work is published under the owner's accounts — a
 * false statement about a real person, and exactly the kind of thing `sameAs`
 * must never get wrong. Every entry here is written by the owner today, so
 * this is a guard rather than a live path.
 */
export function personNode(name: string = CONTACT.name): PersonNode {
  if (name !== CONTACT.name) {
    return { "@type": "Person", name };
  }

  return present({
    "@type": "Person",
    "@id": AUTHOR_ID,
    name,
    url: `${SITE}/about/`,
    jobTitle: CONTACT.role,
    sameAs: [CONTACT.github, CONTACT.linkedin],
  }) as PersonNode;
}

export interface EntryNode {
  "@context": string;
  "@type": "Article" | "BlogPosting";
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  keywords?: string[];
  mainEntityOfPage: string;
  url: string;
  author: PersonNode;
}

export interface ProfilePageNode {
  "@context": string;
  "@type": "ProfilePage";
  mainEntity: PersonNode;
}

export interface WebSiteNode {
  "@context": string;
  "@type": "WebSite";
  name: string;
  url: string;
  author: { "@id": string };
}

interface EntryLike {
  id: string;
  data: {
    title: string;
    description: string;
    author?: string;
    pubDate: Date | string;
    updatedDate?: Date | string;
    kind: "blog" | "project";
    tags?: string[];
    heroImage?: string;
    draft?: boolean;
  };
}

/**
 * An entry as an Article or BlogPosting.
 *
 * A project is not a blog posting — the hierarchy runs CreativeWork > Article >
 * SocialMediaPosting > BlogPosting — so `kind` picks the type.
 *
 * Returns null for a draft: it has no public URL, and describing a page that
 * does not exist is the same mistake as listing it.
 */
export function entryJsonLd(entry: EntryLike): EntryNode | null {
  const { data } = entry;
  if (data.draft) return null;

  const url = `${SITE}/entries/${entry.id}/`;

  return present({
    "@context": "https://schema.org",
    "@type": data.kind === "project" ? "Article" : "BlogPosting",
    headline: data.title,
    description: data.description,
    datePublished: isoDateTime(data.pubDate),
    dateModified: data.updatedDate ? isoDateTime(data.updatedDate) : undefined,
    image: data.heroImage ? absolute(data.heroImage) : undefined,
    keywords: data.tags ?? [],
    mainEntityOfPage: url,
    url,
    author: personNode(data.author ?? CONTACT.name),
  }) as EntryNode;
}

/**
 * The about page as a ProfilePage.
 *
 * Google recommends this when `author.url` points at your own profile page,
 * and names blog "About Me" pages as a valid use. `mainEntity` is what marks
 * the page as being *about* the person rather than merely mentioning them.
 */
export function profilePageJsonLd(): ProfilePageNode {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: personNode(),
  };
}

/**
 * The homepage as a WebSite.
 *
 * Identification only. The sitelinks search box was deprecated in November
 * 2024, so a `potentialAction` produces nothing and is deliberately absent.
 */
export function websiteJsonLd(): WebSiteNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: CONTACT.name,
    url: `${SITE}/`,
    author: { "@id": AUTHOR_ID },
  };
}

/**
 * Serialise a node for embedding in a `<script type="application/ld+json">`.
 *
 * Angle brackets and ampersands are escaped as unicode sequences. A literal
 * `</script>` inside a string would close the block early and spill the rest
 * of the JSON into the document as markup — valid JSON, broken page.
 */
export function serializeJsonLd(node: unknown): string {
  return JSON.stringify(node)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** One entry in a BreadcrumbList or an ItemList. */
export interface ListItemNode {
  "@type": "ListItem";
  position: number;
  name: string;
  /** BreadcrumbList spelling. Omitted on the last crumb. */
  item?: string;
  /** ItemList spelling. */
  url?: string;
}

export interface BreadcrumbNode {
  "@context": string;
  "@type": "BreadcrumbList";
  itemListElement: ListItemNode[];
}

/** A step in a breadcrumb trail. The last one needs no URL — it is this page. */
export interface Crumb {
  name: string;
  url?: string;
}

/**
 * A breadcrumb trail.
 *
 * Returns null below two crumbs: Google requires "at least two ListItem
 * objects", so a single crumb would produce an invalid trail rather than a
 * short one. Callers pass what the page has and let this decide.
 *
 * The last crumb deliberately omits `item` — "If item isn't included for the
 * last item, Google uses the URL of the containing page", which keeps the trail
 * correct across every page sharing a template.
 */
export function breadcrumbJsonLd(crumbs: readonly Crumb[]): BreadcrumbNode | null {
  if (crumbs.length < 2) return null;
  const last = crumbs.length - 1;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => {
      // Built by assignment rather than through `present()`: the key must be
      // absent, not undefined, and an interface without an index signature does
      // not satisfy that helper's constraint.
      const item: ListItemNode = {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
      };
      if (index !== last && crumb.url) item.item = absolute(crumb.url);
      return item;
    }),
  };
}

export interface ItemListNode {
  "@type": "ItemList";
  itemListElement: ListItemNode[];
}

export interface CollectionPageNode {
  "@context": string;
  "@type": "CollectionPage";
  name: string;
  url: string;
  mainEntity: ItemListNode;
}

/**
 * A listing page, as the collection of entries it actually shows.
 *
 * `mainEntity` rather than a bare ItemList: it states that listing these items
 * *is* the page's purpose, instead of leaving the list as an unattached aside.
 *
 * Positions must match the order rendered, so callers pass the same array the
 * template maps over — deriving a second ordering here is how markup and page
 * drift apart.
 *
 * Note this buys semantic clarity, not a rich result: Google renders no
 * carousel for a personal blog index.
 */
export function collectionPageJsonLd(options: {
  name: string;
  url: string;
  items: readonly { name: string; url: string }[];
}): CollectionPageNode {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: options.name,
    url: absolute(options.url),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: options.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absolute(item.url),
        name: item.name,
      })),
    },
  };
}

/**
 * Combines several nodes into one JSON-LD document.
 *
 * A lone node is returned unwrapped. Pages that carry exactly one node are
 * asserted on by their top-level `@type`, and wrapping every page to serve the
 * few that need two would break that for nothing.
 *
 * Nulls are dropped, so a caller can pass a builder's result straight in —
 * `entryJsonLd` returns null for a draft and `breadcrumbJsonLd` for a trail too
 * short, and neither should force a conditional at the call site.
 */
export function graphJsonLd(nodes: readonly unknown[]): unknown {
  const real = nodes.filter((node) => node !== null && node !== undefined);
  if (real.length === 0) return null;
  if (real.length === 1) return real[0];
  return {
    "@context": "https://schema.org",
    "@graph": real.map((node) => {
      const { "@context": _context, ...rest } = node as Record<string, unknown>;
      return rest;
    }),
  };
}

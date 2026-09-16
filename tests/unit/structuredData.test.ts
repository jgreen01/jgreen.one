// Pinned before any import so date handling is exercised in a timezone whose
// local calendar day differs from UTC. A publication date that drifts here is
// invisible: nothing renders it.
process.env.TZ = "America/Los_Angeles";

import { describe, it, expect } from "vitest";
import {
  AUTHOR_ID,
  personNode,
  entryJsonLd,
  profilePageJsonLd,
  websiteJsonLd,
  serializeJsonLd,
} from "../../src/utils/structuredData";
import { CONTACT } from "../../src/utils/contact";

const entry = {
  id: "this-site",
  collection: "entries" as const,
  data: {
    title: "jgreen.one: The Site as a Workbench",
    description: "A static site on AWS built the way a production one would be.",
    author: "Jon Green",
    pubDate: new Date("2026-09-03T00:00:00Z"),
    kind: "project" as const,
    tags: ["astro", "aws"],
    heroImage: "/media/this-site.webp",
    draft: false,
  },
};

const blogEntry = {
  ...entry,
  id: "a-post",
  data: { ...entry.data, kind: "blog" as const },
};

describe("the author node", () => {
  const person = personNode();

  it("is a Person", () => {
    expect(person["@type"]).toBe("Person");
  });

  // Google: "In the author.name property, only specify the name of the author.
  // Don't add any other piece of information."
  it("carries the name and nothing else in name", () => {
    expect(person.name).toBe(CONTACT.name);
    expect(person.name).not.toMatch(/engineer|science|•|,/i);
  });

  it("puts the role in jobTitle, not in the name", () => {
    expect(person.jobTitle).toBe(CONTACT.role);
  });

  it("points url at a page that identifies the author", () => {
    expect(person.url).toBe("https://jgreen.one/about/");
  });

  it("lists the external profiles in sameAs", () => {
    expect(person.sameAs).toEqual([CONTACT.github, CONTACT.linkedin]);
  });

  // A stable @id is what lets the Person on an entry and the Person on /about
  // resolve to one entity rather than two people who share a name.
  it("has a stable @id", () => {
    expect(person["@id"]).toBe(AUTHOR_ID);
    expect(personNode()["@id"]).toBe(person["@id"]);
  });

  // Optional on the type because a guest author has none; the owner always
  // does, and an empty list would be worse than omitting the property.
  it("never emits an empty sameAs", () => {
    const sameAs = person.sameAs ?? [];
    expect(sameAs.length).toBeGreaterThan(0);
    for (const url of sameAs) expect(url).toMatch(/^https:\/\//);
  });
});

describe("entryJsonLd", () => {
  const node = entryJsonLd(entry);

  it("declares the schema.org context", () => {
    expect(node!["@context"]).toBe("https://schema.org");
  });

  // A project page is not a blog posting. The hierarchy is
  // CreativeWork > Article > SocialMediaPosting > BlogPosting.
  it("types a project as an Article", () => {
    expect(node!["@type"]).toBe("Article");
  });

  it("types a blog entry as a BlogPosting", () => {
    expect(entryJsonLd(blogEntry)!["@type"]).toBe("BlogPosting");
  });

  it("uses the title as the headline", () => {
    expect(node!.headline).toBe(entry.data.title);
  });

  it("carries the description", () => {
    expect(node!.description).toBe(entry.data.description);
  });

  it("dates publication with an explicit timezone", () => {
    expect(node!.datePublished).toBe("2026-09-03T00:00:00.000Z");
  });

  it("omits dateModified when the entry was never updated", () => {
    expect(node).not.toHaveProperty("dateModified");
  });

  it("includes dateModified when updatedDate is set", () => {
    const updated = {
      ...entry,
      data: { ...entry.data, updatedDate: new Date("2026-10-01T00:00:00Z") },
    };
    expect(entryJsonLd(updated)!.dateModified).toBe("2026-10-01T00:00:00.000Z");
  });

  it("makes the image absolute", () => {
    expect(node!.image).toBe("https://jgreen.one/media/this-site.webp");
  });

  it("omits image when the entry has no hero", () => {
    const { heroImage, ...data } = entry.data;
    expect(entryJsonLd({ ...entry, data })).not.toHaveProperty("image");
  });

  it("passes an external hero URL through unchanged", () => {
    const external = {
      ...entry,
      data: { ...entry.data, heroImage: "https://cdn.example.com/a.png" },
    };
    expect(entryJsonLd(external)!.image).toBe("https://cdn.example.com/a.png");
  });

  it("carries the tags as keywords", () => {
    expect(node!.keywords).toEqual(["astro", "aws"]);
  });

  it("omits keywords when there are no tags", () => {
    const untagged = { ...entry, data: { ...entry.data, tags: [] } };
    expect(entryJsonLd(untagged)).not.toHaveProperty("keywords");
  });

  it("names the page it describes", () => {
    expect(node!.mainEntityOfPage).toBe("https://jgreen.one/entries/this-site/");
  });

  it("nests the author", () => {
    expect(node!.author["@type"]).toBe("Person");
    expect(node!.author.name).toBe("Jon Green");
  });

  it("uses the author from frontmatter", () => {
    const guest = { ...entry, data: { ...entry.data, author: "Ada Lovelace" } };
    expect(entryJsonLd(guest)!.author.name).toBe("Ada Lovelace");
  });

  // The owner's identity must not be attached to someone else. sameAs asserts
  // that two accounts are the same entity, so claiming a guest author shares
  // the owner's GitHub and LinkedIn would be a false statement about a real
  // person — and the @id would merge them into one entity.
  describe("an author who is not the site owner", () => {
    const guest = { ...entry, data: { ...entry.data, author: "Ada Lovelace" } };
    const author = entryJsonLd(guest)!.author;

    it("is still a Person with their own name", () => {
      expect(author["@type"]).toBe("Person");
      expect(author.name).toBe("Ada Lovelace");
    });

    it("does not borrow the owner's identifier", () => {
      expect(author["@id"]).toBeUndefined();
    });

    it("does not claim the owner's profiles", () => {
      expect(author.sameAs).toBeUndefined();
    });

    it("does not claim the owner's job title", () => {
      expect(author.jobTitle).toBeUndefined();
    });

    it("does not point at the owner's profile page", () => {
      expect(author.url).toBeUndefined();
    });
  });

  it("keeps the full identity when the author is the site owner", () => {
    expect(entryJsonLd(entry)!.author["@id"]).toBe(AUTHOR_ID);
    expect(entryJsonLd(entry)!.author.sameAs).toEqual([CONTACT.github, CONTACT.linkedin]);
  });



  // A draft has no public URL, so describing it would advertise a page that
  // does not exist, on the same reasoning that keeps drafts out of listings.
  it("returns null for a draft", () => {
    const draft = { ...entry, data: { ...entry.data, draft: true } };
    expect(entryJsonLd(draft)).toBeNull();
  });

  it("emits no undefined values anywhere", () => {
    expect(JSON.stringify(node)).not.toContain("undefined");
  });

  it("makes every URL absolute", () => {
    const urls = JSON.stringify(node).match(/"(\/[^"]*)"/g) ?? [];
    expect(urls, `relative URLs: ${urls.join(", ")}`).toHaveLength(0);
  });
});

describe("profilePageJsonLd", () => {
  const node = profilePageJsonLd();

  // Google recommends ProfilePage when author.url points at your own profile
  // page, and names blog "About Me" pages as a valid use.
  it("is a ProfilePage", () => {
    expect(node["@type"]).toBe("ProfilePage");
  });

  it("makes the Person its mainEntity", () => {
    expect(node.mainEntity["@type"]).toBe("Person");
    expect(node.mainEntity.name).toBe(CONTACT.name);
  });

  it("uses the same author identity as an entry", () => {
    expect(node.mainEntity["@id"]).toBe(AUTHOR_ID);
  });
});

describe("websiteJsonLd", () => {
  const node = websiteJsonLd();

  it("is a WebSite", () => {
    expect(node["@type"]).toBe("WebSite");
  });

  it("names the site and its url", () => {
    expect(node.url).toBe("https://jgreen.one/");
    expect(node.name).toBeTruthy();
  });

  // The sitelinks search box was deprecated in November 2024, so a
  // potentialAction produces nothing and only adds noise.
  it("declares no potentialAction", () => {
    expect(node).not.toHaveProperty("potentialAction");
  });
});

describe("serializeJsonLd", () => {
  it("produces parseable JSON", () => {
    expect(JSON.parse(serializeJsonLd(websiteJsonLd()))["@type"]).toBe("WebSite");
  });

  // A literal </script> inside the JSON would end the block early and spill
  // the remainder into the document as markup.
  it("escapes a closing script tag", () => {
    const out = serializeJsonLd({ name: "</script><img onerror=alert(1)>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><img onerror=alert(1)>");
  });

  it("escapes every angle bracket", () => {
    const out = serializeJsonLd({ name: "a < b > c" });
    expect(out).not.toMatch(/[<>]/);
    expect(JSON.parse(out).name).toBe("a < b > c");
  });

  it("escapes an ampersand entity sequence", () => {
    const out = serializeJsonLd({ name: "Tom & Jerry" });
    expect(JSON.parse(out).name).toBe("Tom & Jerry");
  });
});

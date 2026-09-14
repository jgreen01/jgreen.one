/**
 * One definition of who wrote this and how to reach him.
 *
 * The site renders this in three places: the footer on every HTML page, the
 * contact page, and the bottom of every Markdown twin. Keeping it here means
 * the address in a `.md` file an agent quotes cannot drift from the one on the
 * page a person reads.
 */
export const CONTACT = {
  name: "Jon Green",
  role: "Software Engineering & Data Science",
  email: "hello@jgreen.one",
  github: "https://github.com/jgreen01",
  githubHandle: "github.com/jgreen01",
  linkedin: "https://linkedin.com/in/jgreen01",
  linkedinHandle: "linkedin.com/in/jgreen01",
} as const;

/**
 * The footer appended to every Markdown document the site serves.
 *
 * A `.md` twin is read with no surrounding page and no navigation. Without
 * this, an agent that quotes a paragraph has no way back to the author, and
 * the attribution dies with the file. Links are absolute for the same reason.
 */
export function contactBlock(): string {
  return [
    "---",
    "",
    `${CONTACT.name} — ${CONTACT.role}`,
    "",
    `Email: [${CONTACT.email}](mailto:${CONTACT.email})  `,
    `GitHub: [${CONTACT.githubHandle}](${CONTACT.github})  `,
    `LinkedIn: [${CONTACT.linkedinHandle}](${CONTACT.linkedin})`,
    "",
  ].join("\n");
}

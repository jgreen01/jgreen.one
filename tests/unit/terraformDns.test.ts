import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRecordBlocks, checkDnsRules } from "../../scripts/lib/terraform-dns.mjs";

/**
 * Guards for the DNS records Terraform manages (task K).
 *
 * The mail records were made by hand and then imported. What keeps them safe
 * from here on is a handful of rules in the config, and each can be undone by
 * one careless line:
 *
 * - `allow_overwrite` turns "this record already exists" from an error into a
 *   silent replacement.
 * - `ignore_changes` stops Terraform putting a drifted record back, which is
 *   the whole point of managing it.
 * - Without `prevent_destroy`, one bad plan can delete the apex TXT, and with
 *   it SPF. With DMARC at p=reject, mail then bounces.
 * - A hosted zone ID written out goes stale if the zone is ever recreated. The
 *   rule is to look it up (see "Environment & Secrets" in AGENTS.md).
 *
 * These tests catch that in review rather than in production.
 */

// Built from parts so this file carries no ID-shaped literal of its own.
// A suppression marker would not do: the code under test honours it too.
const FAKE_ZONE_ID = ["Z0EXAMPLE", "12345"].join("");

const record = (name: string, body: string) => `
resource "aws_route53_record" "${name}" {
  zone_id = aws_route53_zone.primary.zone_id
${body}
}
`;

const PROTECTED = `lifecycle {
    prevent_destroy = true
  }`;

const file = (text: string, path = "dns.tf") => [{ path, text }];

describe("findRecordBlocks", () => {
  it("finds each aws_route53_record by name, with the line it starts on", () => {
    const text = record("apex_txt", "") + record("apex_mx", "");
    const blocks = findRecordBlocks(text);
    expect(blocks.map((b) => b.name)).toEqual(["apex_txt", "apex_mx"]);
    expect(blocks.map((b) => b.line)).toEqual([2, 7]);
  });

  it("ignores other resource types", () => {
    const text = `resource "aws_route53_zone" "primary" {\n  name = var.domain\n}\n`;
    expect(findRecordBlocks(text)).toEqual([]);
  });

  it("is not fooled by braces inside strings and interpolations", () => {
    const text =
      record("dmarc", `  name = "_dmarc.\${var.domain}"\n  records = ["v=DMARC1; }{ p=reject"]`) +
      record("after", "  ttl = 300");
    const blocks = findRecordBlocks(text);
    expect(blocks.map((b) => b.name)).toEqual(["dmarc", "after"]);
    expect(blocks[0].body).not.toContain("ttl = 300");
  });

  it("handles a string nested inside an interpolation", () => {
    const text =
      record("joined", `  records = ["\${join("}", ["a", "b"])}"]`) + record("after", "  ttl = 300");
    expect(findRecordBlocks(text).map((b) => b.name)).toEqual(["joined", "after"]);
  });

  it("skips a record that is commented out", () => {
    const text = [
      `# resource "aws_route53_record" "old" {`,
      `/* resource "aws_route53_record" "older" { } */`,
      `// resource "aws_route53_record" "oldest" {`,
    ].join("\n");
    expect(findRecordBlocks(text)).toEqual([]);
  });

  it("is not fooled by a heredoc containing braces", () => {
    const text =
      record("doc", `  records = [<<-EOT\n    }}} not code {\n  EOT\n  ]`) + record("after", "");
    expect(findRecordBlocks(text).map((b) => b.name)).toEqual(["doc", "after"]);
  });
});

describe("checkDnsRules", () => {
  const rulesOf = (text: string, protectedRecords: string[] = []) =>
    checkDnsRules(file(text), { protectedRecords }).map((v) => v.rule);

  it("passes a protected record written the right way", () => {
    expect(rulesOf(record("apex_txt", `  ${PROTECTED}`), ["apex_txt"])).toEqual([]);
  });

  it("flags allow_overwrite, whatever its value", () => {
    for (const value of ["true", "false", "null"]) {
      const violations = checkDnsRules(file(record("apex_txt", `  allow_overwrite = ${value}`)), {
        protectedRecords: [],
      });
      expect(violations).toEqual([
        // The attribute's own line, not the resource's: that is the line to change.
        expect.objectContaining({ rule: "allow-overwrite", record: "apex_txt", file: "dns.tf", line: 4 }),
      ]);
    }
  });

  it("flags ignore_changes in a record's lifecycle", () => {
    const body = `  lifecycle {\n    ignore_changes = [records]\n  }`;
    expect(rulesOf(record("apex_txt", body))).toEqual(["ignore-changes"]);
  });

  it("does not flag the rules being mentioned in a comment", () => {
    const body = `  # never allow_overwrite = true, never ignore_changes\n  ${PROTECTED}`;
    expect(rulesOf(record("apex_txt", body), ["apex_txt"])).toEqual([]);
  });

  it("flags a protected record without prevent_destroy", () => {
    expect(rulesOf(record("apex_txt", "  ttl = 300"), ["apex_txt"])).toEqual(["prevent-destroy"]);
  });

  it("flags prevent_destroy = false", () => {
    const body = `  lifecycle {\n    prevent_destroy = false\n  }`;
    expect(rulesOf(record("apex_txt", body), ["apex_txt"])).toEqual(["prevent-destroy"]);
  });

  it("does not accept prevent_destroy outside a lifecycle block", () => {
    expect(rulesOf(record("apex_txt", "  prevent_destroy = true"), ["apex_txt"])).toEqual([
      "prevent-destroy",
    ]);
  });

  it("does not demand prevent_destroy of records that are not protected", () => {
    expect(rulesOf(record("www", "  ttl = 300"), ["apex_txt"])).toEqual(["missing-record"]);
  });

  it("flags a protected record that does not exist at all", () => {
    const violations = checkDnsRules(file(""), { protectedRecords: ["apex_txt"] });
    expect(violations).toEqual([expect.objectContaining({ rule: "missing-record", record: "apex_txt" })]);
  });

  it("flags a hosted-zone-ID literal anywhere, comments included, without echoing it", () => {
    const text = `# zone ${FAKE_ZONE_ID}\n` + record("apex_txt", `  zone = "${FAKE_ZONE_ID}"`);
    const violations = checkDnsRules(file(text), { protectedRecords: [] });
    expect(violations.map((v) => [v.rule, v.line])).toEqual([
      ["identifier-literal", 1],
      ["identifier-literal", 5],
    ]);
    expect(JSON.stringify(violations)).not.toContain(FAKE_ZONE_ID);
  });

  it("accepts the zone referenced rather than written out", () => {
    expect(rulesOf(record("apex_txt", ""))).toEqual([]);
  });

  it("reports violations in file order", () => {
    const text = record("a", "  allow_overwrite = true") + record("b", "  allow_overwrite = true");
    expect(checkDnsRules(file(text), { protectedRecords: [] }).map((v) => v.record)).toEqual(["a", "b"]);
  });
});

/**
 * The real config. The record names are the task-K resources; every one of
 * them was hand-made before being imported, and deleting any of them breaks
 * mail or de-verifies a search console.
 */
const TASK_K_RECORDS = [
  "apex_txt",
  "apex_mx",
  "dmarc",
  "tls_rpt",
  "dkim_protonmail",
  "dkim_protonmail2",
  "dkim_protonmail3",
  "bing_verification",
];

describe("infra/live", () => {
  const dir = fileURLToPath(new URL("../../infra/live/", import.meta.url));
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".tf"))
    .map((name) => ({ path: `infra/live/${name}`, text: readFileSync(join(dir, name), "utf-8") }));

  it("reads the Terraform files", () => {
    expect(files.map((f) => f.path)).toContain("infra/live/dns.tf");
  });

  it("obeys every DNS rule, with each hand-made record protected", () => {
    expect(checkDnsRules(files, { protectedRecords: TASK_K_RECORDS })).toEqual([]);
  });
});

/**
 * Rules for the Route 53 records Terraform manages.
 *
 * The mail and verification records were made by hand, then imported into
 * Terraform (task K). Each rule below can be undone by one careless line, and
 * each failure is silent until mail bounces or a search console de-verifies:
 *
 *   allow-overwrite     `allow_overwrite` on a record, whatever its value. It
 *                       turns "record already exists" into a replacement.
 *   ignore-changes      `ignore_changes` on a record. Terraform would stop
 *                       restoring drift, which is why the records moved in.
 *   prevent-destroy     a protected record without `prevent_destroy = true` in
 *                       its lifecycle block.
 *   missing-record      a protected record that is not defined at all.
 *   identifier-literal  an infrastructure ID written out (a hosted zone ID,
 *                       say). Reuses the secret scanner's detectors, so the
 *                       shapes are defined in one place. Comments count too.
 *
 * Not a full HCL parser. It understands exactly what brace matching needs:
 * strings (with ${...} and %{...} templates, which may nest strings), comments
 * (#, //, /* *\/) and heredocs. That is enough for `terraform fmt` output.
 */
import { scanText } from "./secrets.mjs";

/**
 * Blanks comments and the contents of strings and heredocs, keeping quotes and
 * newlines, so the result lines up character for character with the input.
 * What remains is code: braces that are really braces, attribute names that
 * are really attributes.
 */
export function maskHcl(text) {
  const out = text.split("");
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // Innermost context last. A string may open a template, which is code again
  // and may open another string.
  const stack = [{ kind: "code", depth: 0 }];
  let i = 0;
  while (i < text.length) {
    const top = stack[stack.length - 1];
    const inTemplate = stack.length > 1; // any code here is inside a string
    const ch = text[i];
    const next = text[i + 1];

    if (top.kind === "string") {
      if (ch === "\\") {
        blank(i, i + 2);
        i += 2;
      } else if ((ch === "$" || ch === "%") && next === ch && text[i + 2] === "{") {
        blank(i, i + 3); // $${ is a literal "${", not a template
        i += 3;
      } else if ((ch === "$" || ch === "%") && next === "{") {
        blank(i, i + 2);
        stack.push({ kind: "code", depth: 0 });
        i += 2;
      } else if (ch === '"') {
        stack.pop();
        if (stack.length > 1) blank(i, i + 1); // a quote nested inside a template
        i += 1;
      } else {
        blank(i, i + 1);
        i += 1;
      }
      continue;
    }

    if (ch === "#" || (ch === "/" && next === "/")) {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === "<" && next === "<") {
      const opener = /^<<-?([A-Za-z_][A-Za-z0-9_-]*)\r?\n/.exec(text.slice(i));
      if (opener) {
        const bodyStart = i + opener[0].length;
        const closer = new RegExp(`^[ \\t]*${opener[1]}[ \\t]*$`, "m").exec(text.slice(bodyStart));
        const stop = closer ? bodyStart + closer.index : text.length;
        blank(bodyStart, stop);
        i = closer ? stop + closer[0].length : text.length;
        continue;
      }
    }
    if (ch === '"') {
      if (inTemplate) blank(i, i + 1);
      stack.push({ kind: "string" });
      i += 1;
      continue;
    }
    if (inTemplate) {
      if (ch === "{") top.depth += 1;
      else if (ch === "}") {
        if (top.depth === 0) stack.pop(); // the template's own closing brace
        else top.depth -= 1;
      }
      blank(i, i + 1);
    }
    i += 1;
  }
  return out.join("");
}

/** Index of the brace that closes the one at `open`, in masked text. */
function matchingBrace(masked, open) {
  let depth = 0;
  for (let k = open; k < masked.length; k++) {
    if (masked[k] === "{") depth += 1;
    else if (masked[k] === "}") {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return masked.length;
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

function recordBlocksIn(text, masked) {
  // On masked text a label's contents are blank but its quotes stay, so the
  // labels are read back from the original at the same positions. A resource
  // that sits in a comment or a string has been blanked away entirely.
  const header = /\bresource\s+"([^"]*)"\s+"([^"]*)"\s*\{/dg;
  const blocks = [];
  for (const m of masked.matchAll(header)) {
    const [typeStart, typeEnd] = m.indices[1];
    if (text.slice(typeStart, typeEnd) !== "aws_route53_record") continue;
    const [nameStart, nameEnd] = m.indices[2];
    const open = m.index + m[0].length - 1;
    blocks.push({
      name: text.slice(nameStart, nameEnd),
      line: lineAt(text, m.index),
      open,
      close: matchingBrace(masked, open),
    });
  }
  return blocks;
}

/** Every `aws_route53_record` resource in one file: its name, line and body. */
export function findRecordBlocks(text) {
  return recordBlocksIn(text, maskHcl(text)).map(({ name, line, open, close }) => ({
    name,
    line,
    body: text.slice(open + 1, close),
  }));
}

function hasPreventDestroy(maskedBody) {
  for (const m of maskedBody.matchAll(/\blifecycle\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const lifecycle = maskedBody.slice(open + 1, matchingBrace(maskedBody, open));
    if (/\bprevent_destroy\s*=\s*true\b/.test(lifecycle)) return true;
  }
  return false;
}

const FORBIDDEN = [
  {
    rule: "allow-overwrite",
    attribute: "allow_overwrite",
    message: "allow_overwrite turns an existing record into a silent replacement; remove it",
  },
  {
    rule: "ignore-changes",
    attribute: "ignore_changes",
    message: "ignore_changes stops Terraform restoring drift, the reason the record is managed; remove it",
  },
];

/**
 * Checks Terraform files against the DNS rules.
 *
 * @param {{ path: string, text: string }[]} files
 * @param {{ protectedRecords: string[] }} options  records that must carry
 *   prevent_destroy — the hand-made ones, whose loss breaks mail or
 *   verification
 * @returns {{ rule: string, file: string|null, line: number|null, record?: string, message: string }[]}
 *   in file order, then any missing records. Never carries a matched value.
 */
export function checkDnsRules(files, { protectedRecords }) {
  const wanted = new Set(protectedRecords);
  const found = new Set();
  const violations = [];

  for (const { path, text } of files) {
    const masked = maskHcl(text);
    const here = [];

    for (const block of recordBlocksIn(text, masked)) {
      found.add(block.name);
      const body = masked.slice(block.open + 1, block.close);
      for (const { rule, attribute, message } of FORBIDDEN) {
        for (const m of body.matchAll(new RegExp(`\\b${attribute}\\s*=`, "g"))) {
          const line = lineAt(text, block.open + 1 + m.index);
          here.push({ rule, file: path, line, record: block.name, message });
        }
      }
      if (wanted.has(block.name) && !hasPreventDestroy(body)) {
        here.push({
          rule: "prevent-destroy",
          file: path,
          line: block.line,
          record: block.name,
          message: "a hand-made record needs lifecycle { prevent_destroy = true }",
        });
      }
    }

    for (const finding of scanText(text, path)) {
      if (finding.kind !== "identifier") continue;
      here.push({
        rule: "identifier-literal",
        file: path,
        line: finding.line,
        message: `${finding.description} written out; reference it or look it up instead`,
      });
    }

    here.sort((a, b) => a.line - b.line);
    violations.push(...here);
  }

  for (const name of protectedRecords) {
    if (!found.has(name)) {
      violations.push({
        rule: "missing-record",
        file: null,
        line: null,
        record: name,
        message: `aws_route53_record.${name} is not defined`,
      });
    }
  }
  return violations;
}

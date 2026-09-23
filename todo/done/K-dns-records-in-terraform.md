# Bring the hand-made DNS records into Terraform

**Priority**: MEDIUM — nothing is broken, but these are the records that deliver your email
**Status**: DONE
**Created**: 2026-09-22
**Updated**: 2026-09-22

## In plain terms

Most of your DNS records were added by hand in the AWS console. Terraform doesn't
know about them. If one gets changed or deleted by mistake, nothing puts it back,
and new verifications like Google's can't be added through Terraform.

This task hands those records to Terraform **without changing any of them**. Once
it's done:

- a record changed or deleted in the console shows up in `terraform plan`, and the
  next apply puts it back;
- adding a new verification is a one-line change to `dns.tf`, then plan and apply.

The main risk is the `jgreen.one` TXT record. It holds three values together,
including your email's SPF setting. Handled wrongly, Terraform replaces it and
your email starts bouncing. The procedure below is built around avoiding that,
and a backup exists so the records can be put back by hand if anything goes wrong.

## Current state (verified 2026-09-22)

| Record | Type | Managed by |
|---|---|---|
| the zone itself, NS, SOA | — | Terraform (`aws_route53_zone.primary`) |
| `jgreen.one` | A, AAAA | Terraform |
| `www.jgreen.one` | CNAME | Terraform |
| two `_<hash>` ACM validation records | CNAME | Terraform (`certificate.tf`) |
| **`jgreen.one`** | **TXT** — SPF + google-site-verification + protonmail-verification, **one record, three values** | **by hand** |
| **`jgreen.one`** | **MX** — Proton, primary and backup | **by hand** |
| **`_dmarc.jgreen.one`** | **TXT** (`p=reject`) | **by hand** |
| **`_smtp._tls.jgreen.one`** | **TXT** (TLS-RPT) | **by hand** |
| **`protonmail._domainkey`**, **`protonmail2._domainkey`**, **`protonmail3._domainkey`** | **CNAME** (DKIM) | **by hand** |
| **`<bing-token>.jgreen.one`** | **CNAME** → `verify.bing.com` | **by hand** |

`tests/infra/test_dns.py` already asserts every hand-made record exists and is
correct. So drift is **detected** today, but never **restored**.

## Scope

**In: every hand-made record — eight record sets.** The apex TXT (whole), MX,
`_dmarc`, `_smtp._tls`, the three DKIM CNAMEs, and the Bing CNAME.

**Out:**
- Everything already in Terraform. Don't touch it.
- NS and SOA. The zone resource owns these implicitly; importing them causes
  conflicts.

### Why Bing is in

An earlier draft left the Bing CNAME out. The reasons didn't hold up:

- "It's a verification record." So are the Google and Proton tokens, and those
  are in scope because they sit inside the apex TXT. Verification records were
  never really being kept out; only Bing was.
- "Putting it back after a mistake isn't worth much." It is. If the record
  disappears, Bing quietly stops reading the sitemap, and Bing's index feeds
  ChatGPT Search, Copilot and DuckDuckGo.
- "The test already catches it." That's equally true of the email records,
  which are in scope anyway.

So the rule is simple: **every hand-made record goes into Terraform**, which
also means every future verification can go through Terraform.

## Is it safe to put these in a public repo?

Yes. The record *values* are already public: anyone can query them from DNS.
Checked specifically:

- **The report address** in `_dmarc` and `_smtp._tls` is `dmarc@jgreen.one`,
  which is already in the repo at `todo/done/5-mail-lockdown.md`. Nothing new
  gets published.
- **The Bing token.** Its random name can't be found through DNS today, and would
  be once it's in git. That gives nobody anything, whichever way Bing's
  verification works. If tokens are tied to *your Bing account*, anyone else's
  token differs and yours is useless to them. If they're tied to *the site*,
  Bing would hand a stranger the same token when they added jgreen.one, so they'd
  never need the repo. (Bing's documentation doesn't say which; it doesn't matter
  here.)
- **The secret scanner.** With the Google and Proton tokens written into HCL,
  `check-secrets` reports **no findings** (tested 2026-09-22), so the pre-commit
  hook won't block it. GitHub push protection is a separate system and couldn't
  be tested beforehand; if it blocks the push, investigate before overriding.

### The hosted zone ID is NOT committed

**Rule, decided 2026-09-22:** the Route 53 hosted zone ID doesn't go into the
repo. It isn't a secret, but nothing needs it written out:

- Terraform resources use `aws_route53_zone.primary.zone_id`, as the rest of
  `dns.tf` already does.
- The import blocks below look the zone up by domain name.
- Shell commands get it from `terraform output -raw hosted_zone_id`, or from
  `aws route53 list-hosted-zones-by-name --dns-name jgreen.one`.

The one place it *does* appear is `generated_dns.tf`, which step 3 writes and
step 4 deletes. **Never commit that file.** Step 8 checks the repo for the ID
before anything is committed.

## The hazard

**Route 53 stores every TXT value at a name as one record, and Terraform manages
the whole record, not a single value.**

So if the Terraform config for `jgreen.one TXT` lists fewer than all three
values, applying it replaces the live record with what's in config. SPF and
the Proton token disappear, and with DMARC at `p=reject`, email that fails SPF
gets rejected. The same logic applies to every record here, but the apex TXT is
where it would hurt most. MX works the same way: it has two values, primary and
backup, and both must survive.

## Rules

- **Never `allow_overwrite = true`.** It turns "record already exists" from an
  error into a silent replacement.
- **Never `lifecycle { ignore_changes = [records] }`.** It stops Terraform from
  putting drifted records back, which is the whole point of the task.
- **`lifecycle { prevent_destroy = true }` on every record in this task.**
  Terraform will then refuse any plan that deletes or replaces one. To remove a
  record deliberately later, delete that line first.
- **The plan must say zero adds, changes and destroys before any apply.** Not
  "1 to change", not a TTL tweak. If anything differs, stop and find out why.
- **Import blocks, not the `terraform import` command.** The command writes to
  state immediately, before you know whether the config matches. An import block
  does nothing until `apply`, so `plan` shows the import *and* any differences
  with nothing written. Terraform here is v1.12.2, which supports import blocks
  (since 1.5) and `-generate-config-out`.
- **Don't commit the hosted zone ID** — see above.

## Procedure

Run everything from `infra/live`. Terraform state is in the remote S3 backend,
so make sure nobody else is running Terraform at the same time.

### 1. Back up the zone

**A backup already exists** from 2026-09-22:
`~/jgreen-one-dns-backup-20260922-165553/`. Its `README.md` explains how to
restore from it with the AWS CLI alone. It holds `restore-hand-made.json`, ready
to apply, with UPSERTs for exactly the eight records in this task.

**Take a fresh one immediately before starting anyway**, in case anything has
changed since:

```bash
B="$HOME/jgreen-one-dns-backup-$(date +%Y%m%d-%H%M%S)"; mkdir -m 700 "$B"
ZONE=$(terraform output -raw hosted_zone_id)
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" > "$B/zone-export.json"
python3 - "$B" <<'PY'
import json, sys
b = sys.argv[1]
rr = json.load(open(f"{b}/zone-export.json"))["ResourceRecordSets"]
keep = [r for r in rr if not (r["Name"] == "jgreen.one." and r["Type"] in ("NS", "SOA"))]
json.dump({"Changes": [{"Action": "UPSERT", "ResourceRecordSet": r} for r in keep]},
          open(f"{b}/restore-all.json", "w"), indent=2)
print(len(keep), "record sets saved")
PY
chmod 600 "$B"/*
```

`restore-all.json` puts every record except NS and SOA back exactly as it was at
that moment. Taken just before starting, that's precisely "undo this task".
Keep backups **outside the repo**: they contain the zone ID and the tokens.

### 2. Add import blocks

Create `infra/live/dns-imports.tf`. It looks the zone up by name, so the ID is
never written into a file:

```hcl
# Temporary. Delete after step 6.
data "aws_route53_zone" "for_import" {
  name = var.domain
}

locals {
  z = data.aws_route53_zone.for_import.zone_id
}

import {
  to = aws_route53_record.apex_txt
  id = "${local.z}_${var.domain}_TXT"
}
import {
  to = aws_route53_record.apex_mx
  id = "${local.z}_${var.domain}_MX"
}
import {
  to = aws_route53_record.dmarc
  id = "${local.z}__dmarc.${var.domain}_TXT"
}
import {
  to = aws_route53_record.tls_rpt
  id = "${local.z}__smtp._tls.${var.domain}_TXT"
}
import {
  to = aws_route53_record.dkim_protonmail
  id = "${local.z}_protonmail._domainkey.${var.domain}_CNAME"
}
import {
  to = aws_route53_record.dkim_protonmail2
  id = "${local.z}_protonmail2._domainkey.${var.domain}_CNAME"
}
import {
  to = aws_route53_record.dkim_protonmail3
  id = "${local.z}_protonmail3._domainkey.${var.domain}_CNAME"
}
import {
  to = aws_route53_record.bing_verification
  id = "${local.z}_<bing-token>.${var.domain}_CNAME"
}
```

The ID format is `<zone id>_<record name>_<type>`, with no trailing dot on the
name. Names that start with an underscore therefore give a **double**
underscore (`__dmarc`). That's correct, not a typo.

**`<bing-token>`** is the 32-character name of the Bing record. Get it with:

```bash
aws route53 list-resource-record-sets --hosted-zone-id "$(terraform output -raw hosted_zone_id)" \
  --query "ResourceRecordSets[?ResourceRecords[0].Value=='verify.bing.com'].Name" --output text
```

(Drop the trailing `.jgreen.one.` from the result.) It ends up in `dns.tf` as the
record name, which is fine; see "Is it safe" above.

✅ **Verified 2026-09-22:** an import `id` built from a data source works; all
eight records imported this way. (Terraform's documentation allows any
expression "known during the plan" but shows no data-source example.) If it
ever fails, fall back to a variable, which is known at plan
time by definition: declare `variable "import_zone_id" {}` in this file, use
`var.import_zone_id` instead of `local.z`, and pass
`-var "import_zone_id=$(terraform output -raw hosted_zone_id)"` to each plan and
apply. Either way the ID stays out of the file.

### 3. Let Terraform write the resources

```bash
terraform plan -generate-config-out=generated_dns.tf
```

This writes the HCL straight from the live records, so no TXT value gets typed
by hand. Mistyping one is exactly how SPF would get deleted.

⚠️ This file **will** contain the literal zone ID. Step 4 removes it.

Expect this plan to end in `Error: Missing required argument` about
`multivalue_answer_routing_policy`. The generated config sets it to `false`
without a `set_identifier`, a known provider quirk. The file is still written
in full, and step 4 drops the attribute.

### 4. Review and tidy the generated file

- Every record must be present, with **all** its values: **three** for the apex
  TXT, **two** for MX.
- Swap the literal zone ID for `aws_route53_zone.primary.zone_id`, and the
  literal domain for `var.domain` (`"_dmarc.${var.domain}"` and so on), to match
  the rest of `dns.tf`.
- Remove any generated `allow_overwrite` line.
- Add `lifecycle { prevent_destroy = true }` to each.
- Move the resources into `dns.tf`, then **delete `generated_dns.tf`**.

### 5. The gate

```bash
terraform plan
```

Required result:

```
Plan: 8 to import, 0 to add, 0 to change, 0 to destroy.
```

**Anything other than zero adds, changes and destroys means stop.** The most
likely cause is a value that didn't survive the tidy-up in step 4. Nothing has
been written yet, so stopping is free.

### 6. Apply

```bash
terraform apply
```

It must report **8 imported, 0 added, 0 changed, 0 destroyed**. With import
blocks, the import only happens at apply, so this step is required.

### 7. Confirm

```bash
terraform plan                 # must now say: No changes.
terraform state list | grep route53
python3 -m pytest ../../tests/infra -q   # everything that passed before must still pass
dig +short TXT jgreen.one @8.8.8.8       # still three values
dig +short MX jgreen.one @8.8.8.8        # still two servers
```

Then check that email still authenticates. Send a message from your
`jgreen.one` address to an outside mailbox (Gmail: **Show original**) and
confirm **SPF, DKIM and DMARC all say PASS**.

### 8. Tidy up, and check before committing

```bash
rm dns-imports.tf              # the import blocks have done their job
cd ../..
git grep -n "$(terraform -chdir=infra/live output -raw hosted_zone_id)" -- infra/ todo/K-dns-records-in-terraform.md \
  && echo "STOP: zone ID found" || echo "zone ID not in infra/ or this task ✓"
ls infra/live/generated_dns.tf 2>/dev/null && echo "STOP: delete generated_dns.tf"
npm run check:secrets
```

The `git grep` finds the ID without it ever being typed, because it asks
Terraform for the value.

## If something goes wrong

- **Before step 6 (apply):** nothing has changed anywhere. Delete the new files.
- **After apply, to give a record back to manual control:**
  `terraform state rm aws_route53_record.<name>` removes it from Terraform
  **without deleting it** from Route 53 (`prevent_destroy` doesn't block this),
  then remove its config.
- **If a live record got damaged:** apply the backup from step 1. Its README has
  the exact command. It uses only the AWS CLI, so it works even if Terraform is
  what broke. Then work out how the plan let it through.

## After this task

Adding a Google-style verification becomes:

```hcl
records = [
  "v=spf1 include:_spf.protonmail.ch ~all",
  "google-site-verification=…",
  "protonmail-verification=…",
  "new-service-verification=…",   # the only new line
]
```

Then plan, which should show one change to `apex_txt` and nothing else, and
apply. A Bing-style verification is a new `aws_route53_record` block instead.

## Testing

`tests/infra/test_dns.py` already asserts on every record in scope, including
`TestSearchEngineVerification` for Bing, so running it before and after is the
main check.

Worth adding a small guard so the rules above can't quietly slip later: a
hermetic test in `npm test` that reads the `.tf` files in `infra/live/` and fails
if:

- any `aws_route53_record` sets `allow_overwrite` or `ignore_changes`;
- any record in this task is missing `prevent_destroy`;
- **any file contains a hosted-zone-ID-shaped literal.** `scripts/lib/secrets.mjs`
  already detects that shape (`route53-zone-id`), so the test can reuse it
  rather than repeat the pattern.

It catches the mistake in review rather than in production.

## Acceptance Criteria

- [x] Fresh zone backup taken outside the repo immediately before starting —
      `~/jgreen-one-dns-backup-20260922-210905/`, identical to the 16:55 one
- [x] Eight record sets imported with import blocks — the apex TXT carrying all
      three values, MX both
- [x] Plan before apply: `8 to import, 0 to add, 0 to change, 0 to destroy`
- [x] Apply: `8 imported, 0 added, 0 changed, 0 destroyed`
- [x] Plan after apply: `No changes` (and again after removing `dns-imports.tf`)
- [x] `prevent_destroy` on every imported record; no `allow_overwrite`, no
      `ignore_changes`
- [x] Zone ID and domain use references, matching the rest of `dns.tf`
- [x] **The hosted zone ID appears nowhere in the change** — swept the whole
      working tree, tracked and untracked; `generated_dns.tf` deleted
- [x] `pytest tests/infra` passes — 67 passed, 1 skipped, before and after
- [x] A test email shows SPF, DKIM and DMARC PASS — sent by Jon from
      `jon@jgreen.one` to an outside mailbox (Tutanota), 2026-09-22 22:08 local
      (05:08 UTC on the 23rd),
      after the import. `Received-SPF: Pass` (Proton IP, envelope-from aligned);
      `dkim=pass header.d=jgreen.one header.s=protonmail`, aligned under
      `adkim=s`; `dmarc=pass (p=reject)`.
- [x] `npm run check:secrets` clean; pushed 2026-09-22 (`79b7662`,
      `ec32e73`, `d2ad345`) — GitHub push protection did not block the tokens
- [x] Guard test for the Terraform rules — `tests/unit/terraformDns.test.ts`
      with `scripts/lib/terraform-dns.mjs`
- [x] `dns-imports.tf` removed after the apply

## Notes

### Codex was consulted, 2026-09-22

Codex (`gpt-5.5`, read-only) reviewed the idea and agreed on putting the email
records into Terraform. It corrected three points in the original reasoning, all
built into this task:

1. **Importing doesn't make it safe on its own.** A record imported with
   incomplete config still loses values on the next apply. The safety is complete
   config, then import, then a plan that shows no changes.
2. There were **eight** hand-made record sets, not seven. The Bing CNAME was
   added after the first count.
3. **`prevent_destroy`** on the email records.

Codex also recommended keeping the Bing CNAME out, on the grounds that a
published token "may let someone else verify the site". That doesn't hold in
either of the ways Bing's verification could work (see "Is it safe" above), and
after discussing it with Jon, Bing is in.

Codex's sandbox had no AWS access. The report address and the Terraform
version were checked separately.

### Sources

- [Terraform: `aws_route53_record` import format](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_record#import)
- [Terraform: import block reference](https://developer.hashicorp.com/terraform/language/block/import)
- [Terraform: import blocks and `-generate-config-out`](https://developer.hashicorp.com/terraform/language/import/generating-configuration)
- Session notes: `~/.session-notes/2026-09-22-jgreen-one-search-engines-bing-dns.md`

## Log

- [2026-09-22] Created after the Bing verification CNAME had to be added by
  hand, which surfaced that all mail and verification DNS lives outside
  Terraform. Reviewed with Codex. Verified: Terraform v1.12.2; the report
  address is already public in the repo; the scanner doesn't flag the tokens as
  HCL.
- [2026-09-22] Revised with Jon. **Bing now in scope** (eight record sets, not
  seven); the reasons for excluding it didn't hold. **The hosted zone ID no
  longer appears in this task**: the import blocks look the zone up by name, and
  commands get the ID from `terraform output`. Checked that the live `.tf` files
  never hardcoded it: they all use `aws_route53_zone.primary.zone_id`. **Backup
  taken**: `~/jgreen-one-dns-backup-20260922-165553/`, with ready-to-apply UPSERT
  batches and a README for restoring with the AWS CLI alone. Validated: 8
  hand-made record sets, apex TXT with all 3 values, every batch entry in a valid
  Route 53 shape.
- [2026-09-22] **Imported; nothing in DNS changed.** Done autonomously.
  - Fresh backup `~/jgreen-one-dns-backup-20260922-210905/`: 15 record sets,
    identical to the 16:55 backup.
  - Baseline plan before starting: `No changes`, so any change in the import
    plan could only come from this task.
  - **Guard test, written first** (RED on the 8 missing records, then GREEN):
    `scripts/lib/terraform-dns.mjs` masks comments, strings, templates and
    heredocs so that brace matching and attribute checks see only code. It
    flags `allow_overwrite` and `ignore_changes` on any `aws_route53_record`, a
    protected record without `lifecycle { prevent_destroy = true }` or missing
    entirely, and any infrastructure-ID literal (reusing
    `scripts/lib/secrets.mjs`). 20 tests. Mutation-checked against the real
    `dns.tf`: it catches `prevent_destroy = false`, an added `allow_overwrite`
    and a deleted record.
  - Import ids from the data source worked. `-generate-config-out` ended in
    the `multivalue_answer_routing_policy` error (see step 3); the file was
    complete regardless.
  - Tidy-up by script, not by hand. Every `records` list was copied verbatim
    and checked 8 of 8 before `generated_dns.tf` was deleted. Literals were
    swapped for `aws_route53_zone.primary.zone_id` and `var.domain`; the apex
    TXT was split to one value per line (checked equal).
  - **Gate**, checked from `terraform show -json` rather than by eye:
    - 8 imports, exactly the task-K addresses;
    - all 36 managed resources no-op;
    - every imported record's state equal to its config;
    - no deferred data reads, no output changes.
    - `resource_drift` was **not** empty: the CloudFront distribution's
      `etag`, and `markdown_twin_headers`' `status` (`IN_PROGRESS` →
      `DEPLOYED`, left over from task J's apply). Both are computed-only,
      absent from config and cause no action, so the gate was opened for
      exactly that. The apply recorded the current values in state.
  - Applied the **saved plan file** that was checked: `8 imported, 0 added,
    0 changed, 0 destroyed`.
  - After the apply:
    - plan `No changes`;
    - live zone identical record-for-record to the backup;
    - 8.8.8.8 and 1.1.1.1 both return 3 apex TXT values, SPF included, and
      both MX;
    - `pytest tests/infra` 67 passed, 1 skipped;
    - `npm test` all green.
  - `dns-imports.tf` removed, then plan `No changes` again. The zone ID is
    nowhere in the working tree; the Bing token is only in `dns.tf`.
  - ⚠️ **Until `dns.tf` is committed and pushed, run Terraform only from this
    working copy.** State now holds the 8 records. A checkout without their
    config (`origin/main`, say) would plan to **destroy all eight**, and
    `prevent_destroy` lives in that missing config, so it would not stop
    it. `deploy.sh` only reads outputs, so it is safe.
  - **Test email passed** (2026-09-22): SPF, DKIM and DMARC all PASS at an
    outside receiver, sent after the import.
  - **Committed and pushed** (2026-09-22). With `dns.tf` on `origin/main`,
    the run-Terraform-only-from-this-copy caveat above no longer applies.
  - `data.aws_route53_zone.for_import` is still listed in state. Its config is
    gone, and Terraform drops an orphaned data source silently on the next
    apply; plan already ignores it.

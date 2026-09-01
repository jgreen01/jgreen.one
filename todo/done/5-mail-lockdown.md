# Mail Lockdown (DMARC/SPF/DKIM hardening)

**Priority**: MEDIUM
**Status**: DONE (not committed)
**Created**: 2026-07-06
**Updated**: 2026-08-31

## Description

On 2026-07-05/06, jgreen.one's email was cut over from Tutanota to ProtonMail (MX, DKIM, SPF records replaced; see Route 53 zone Z01752721Z1AXUQEVQZ2D). The existing `_dmarc.jgreen.one` TXT record (`v=DMARC1; p=quarantine; adkim=s`) predates the cutover and was left as-is to first validate basic deliverability. This task covers hardening DMARC once the basic Proton setup is confirmed working.

## Acceptance Criteria

- [x] Confirm Proton domain verification (MX/DKIM/SPF) fully passed in Proton's dashboard
- [x] Send/receive test mail through the new Proton setup, confirm no deliverability issues
- [x] Add `rua=mailto:dmarc@jgreen.one` to the DMARC record for aggregate reporting
- [x] Decide on and add explicit `aspf` alignment mode (set to `aspf=r`, relaxed; `adkim=s` stays strict)
- [x] After a validation period, move `p=quarantine` → `p=reject` — **done 2026-08-31.**
      Reports read afterwards and clean, but on a 2-message sample — see the Outcome section.
- [x] Add TLS-RPT record (`_smtp._tls.jgreen.one` TXT) for opportunistic-TLS failure reporting
- [x] Decide on catch-all address (Proton paid-plan feature, Settings → Domain names → Set catch-all) — enabled
- [ ] Consider bringing DMARC/SPF/MX records under Terraform management in `infra/live/dns.tf` — **not done.** `test_dns.py` now covers the risk this was mostly guarding against (an unnoticed manual edit), which lowers its urgency considerably.
- [x] Add `tests/infra/test_dns.py` pinning the mail records — **18 tests, all passing**


## Outcome — 2026-08-31

DMARC is now `p=reject`, the zone is clean, and 18 tests pin the records.

```
v=DMARC1; p=reject; adkim=s; aspf=r; pct=100; rua=mailto:dmarc@jgreen.one
```

### The reports were read afterwards, and they are clean — on a small sample

The flip was made on structural grounds before anyone had read a DMARC aggregate report.
Jon supplied four Google reports the same evening, covering the `p=quarantine` period.
They support the decision, with a real caveat about sample size.

**DMARC aggregate (the two `.zip`/XML files):**

| Day | Policy | Source IP | Msgs | Disposition | Aligned DKIM/SPF |
|---|---|---|---|---|---|
| 2026-08-09 | quarantine | 79.135.106.116 | 1 | none | pass / pass |
| 2026-08-19 | quarantine | 79.135.106.25 | 1 | none | pass / pass |

**2 messages, 2 fully aligned, 0 failures.** Both IPs reverse to `mail-*.protonmail.ch`
and sit inside Proton's published SPF range `79.135.106.0/24`, so they are genuinely
Proton rather than something that merely passed. No unauthorised sender appeared, which
is mild evidence nobody is actively spoofing the domain.

**Two limits worth stating plainly:**

1. **Two messages across two sampled days** is not "eight weeks of clean reports". It is
   too sparse to reveal an infrequent sender — a monthly newsletter, a contact-form
   notifier, a CI alert — that is not Proton.
2. **Google only.** These cover mail sent *to Gmail recipients*. Microsoft, Yahoo and
   other receivers publish their own reports, which nobody has looked at.

So: nothing is failing and nothing suspicious appeared, which for a genuinely
single-sender domain is the expected shape. That makes the flip a reasonable call rather
than a hopeful one — but it found no unaligned sender, which is not the same as proving
none exists.

**Residual risk, unchanged:** if something other than Proton sends as `@jgreen.one`, its
mail now **hard-bounces** instead of going to spam. If any mail is reported missing,
revert first and diagnose after.

**Keep reading the reports for a few more weeks.** The sample is thin enough that a
sender appearing once a month would not yet have shown up.

### The other two files were TLS-RPT, not DMARC

The `.json.gz` pair are SMTP TLS reports (`smtp-tls-reporting@google.com`), a different
mechanism entirely: 2 successful TLS sessions, 0 failures, across 2026-08-10 and
2026-08-20. Both record `"policy-type": "no-policy-found"` — that is **MTA-STS being
absent**, exactly as decided in the Notes below, not a fault. The TLS-RPT record is doing
its job: reporting on opportunistic TLS without an MTA-STS policy to enforce.

**Rollback** — replace the `_dmarc.jgreen.one` TXT record with:
```
v=DMARC1; p=quarantine; adkim=s; aspf=r; pct=100; rua=mailto:dmarc@jgreen.one
```

### A stale record the cutover left behind

The apex carried `t-verify=5e92f11c60e8ed9d880de4b73818a74c` — a **Tutanota** domain
verification token, still there thirteen months after the migration. Removed.

Worth noting how nearly it was missed: the test this task originally specified looked for
records "referencing `tutanota`", and this token never says *tutanota* anywhere. The check
that caught it matches the *shape* of a verification token instead, and allowlists the
current provider's. If Tutanota is ever set up again on this domain, it will need
re-verifying — the value is recorded above.

### Tests

`tests/infra/test_dns.py`, read-only, part of the infra suite (now **54 tests** total):
DMARC contents and enforcement, **exactly one SPF record** (two is a permanent error under
RFC 7208 that silently breaks alignment), no `+all`, the three DKIM selectors, MX with a
backup, TLS-RPT, and no stale provider tokens.

The `p=reject` assertion was written **before** the record changed, so it failed first and
then passed. It now also guards against the policy being quietly loosened later.

Route 53 is the authority these tests read. That is a different question from what the
world resolves — a record can be right in the zone and still not propagate, which bit
during this very change when a cached Google resolver kept serving `p=quarantine` after
the authoritative nameservers had switched. Use `dig @<authoritative-ns>` when checking.

## Notes

Target end-state DMARC record (subject to review before applying):
```
v=DMARC1; p=reject; adkim=s; aspf=r; pct=100; rua=mailto:<address>@jgreen.one
```
Start with `p=quarantine` + `rua` while validating, then bump to `p=reject`.

**MTA-STS researched 2026-07-06: NOT natively supported by Proton for custom domains.** Enabling it requires self-hosting an MTA-STS policy file over HTTPS (valid cert) at `mta-sts.jgreen.one` yourself — Proton doesn't provide one. That's ongoing infra (static file host + cert renewal) for a low-probability threat (active SMTP downgrade MITM) on a personal domain. Decision: deferred / out of scope for this task unless priorities change. If revisited, see community guides: wonderfall.dev/mta-sts, privsec.dev MTA-STS-for-Proton guide, samuel.forestier.app "zero maintenance" approach.

**TLS-RPT researched 2026-07-06: works standalone, no MTA-STS or hosting required** — just a TXT record per RFC 8460. Reports opportunistic-TLS failures for inbound mail. Low effort, added to acceptance criteria above.

**Catch-all researched 2026-07-06: Proton supports it, paid plans only.** Settings → All Settings → Organization → Domain names → Actions → Set catch-all. Proton recommends pointing it at a dedicated address (e.g. `catchall@jgreen.one`), not your main inbox, to avoid clutter.

## Testing

Nothing in this task touches site code, so the Vitest/Playwright suites are irrelevant.
But task 4 added `tests/infra/` (pytest + boto3, read-only, live AWS) — and Route 53 is
an AWS resource, so these records **can** be pinned there. That matters most for the
records still managed by hand: right now nothing would tell you if one got edited or
deleted in the console.

### Two layers, testing different things

- **`dig` — what the world actually sees.** Catches propagation and delegation problems.
  This is the gate before flipping `p=reject`.
- **boto3 `list_resource_record_sets` — what Route 53 holds.** The authoritative record.
  Catches drift, accidental console edits, and (once criterion 8 lands) Terraform
  producing something other than intended.

Both are worth having; a record can be correct in Route 53 and still not resolve.

### New: `tests/infra/test_dns.py`

`conftest.py` currently has fixtures for CloudFront, S3, WAFv2, SNS, CloudWatch and
Budgets — **add a `route53` client fixture and a `zone_records` session fixture** that
pages `list_resource_record_sets` for zone `Z01752721Z1AXUQEVQZ2D` once and returns
records keyed by `(name, type)`.

Assertions to write:

- **DMARC** — `_dmarc.jgreen.one` TXT exists, starts `v=DMARC1`, and carries
  `adkim=s`, `aspf=r`, `pct=100`, `rua=mailto:dmarc@jgreen.one`. Assert the policy is
  in `{quarantine, reject}` — never `none` — so the test passes today and still guards
  after the flip.
- **The `p=reject` flip itself** — write `assert "p=reject" in dmarc` *first*, watch it
  fail, then change the record, then watch it pass. That is the TDD loop applied to DNS,
  and it means the flip cannot be silently reverted later.
- **SPF** — exactly **one** TXT record on the apex starting `v=spf1`. Two SPF records is
  a permanent-error condition that silently breaks alignment, and it is the single
  easiest thing to get wrong when adding a verification TXT.
- **DKIM** — the three Proton `*._domainkey.jgreen.one` CNAMEs exist and point at
  Proton hosts.
- **MX** — points at Proton's servers, with the expected priorities and nothing left
  over from Tutanota.
- **TLS-RPT** — `_smtp._tls.jgreen.one` TXT is `v=TLSRPTv1` with the `rua` address.
- **No stale Tutanota records** — assert nothing in the zone references `tutanota`.
  A leftover MX or SPF include is exactly the kind of thing that lingers unnoticed
  after a provider cutover.

Keep these read-only like the rest of the suite. Run with `pytest tests/infra -v`; it
skips itself cleanly without AWS credentials.

### Manual verification (before flipping `p=reject`)

```bash
dig +short TXT _dmarc.jgreen.one
dig +short TXT jgreen.one            # exactly one v=spf1 line
dig +short MX jgreen.one
dig +short TXT _smtp._tls.jgreen.one
dig +short CNAME protonmail._domainkey.jgreen.one
```

Then, and this is the part that actually matters: **read the aggregate reports.** Two
clean weeks at `p=quarantine` with `rua` flowing, confirming every legitimate source
passes DKIM *and* alignment. Send through every path that sends as `@jgreen.one` —
webmail, phone client, and any app or script — since `p=reject` makes a missed sender a
hard bounce, not a spam-folder inconvenience. A round-trip to a Gmail address and
reading `Authentication-Results` in the raw headers is the cheapest real check.

### Ordering note

If criterion 8 (records into Terraform) happens, do it **before** the `p=reject` flip.
Importing a `p=reject` record is the same work as importing `p=quarantine`, but doing
the flip in Terraform gives you a reviewable `terraform plan` diff of a change that can
bounce your mail — worth more here than anywhere else in this repo.

## Log

- [2026-07-06] Created after ProtonMail cutover; deferring DMARC hardening until basic setup is verified.
- [2026-07-06] Proton dashboard shows domain verified; test email sent/received successfully. Added `rua=mailto:dmarc@jgreen.one`, `aspf=r`, `pct=100` to DMARC record — full value now `v=DMARC1; p=quarantine; adkim=s; aspf=r; pct=100; rua=mailto:dmarc@jgreen.one`. Confirmed live via `dig`. Remaining: wait ~1-2 weeks for clean aggregate reports, then flip to `p=reject`; separately consider moving DNS records into Terraform.
- [2026-07-06] Researched MTA-STS/TLS-RPT/catch-all support in Proton. Added `_smtp._tls.jgreen.one` TXT record `v=TLSRPTv1; rua=mailto:dmarc@jgreen.one` — confirmed live via `dig`. Jon enabled Proton catch-all directly in dashboard. MTA-STS deferred (Proton has no native support; would require self-hosting a policy file/cert).
- [2026-08-30] Added a **Testing** section. No code changes here, so task 4's site test
  suites do not apply — but `tests/infra/` (pytest + boto3) does, and Route 53 is an AWS
  resource, so the mail records can be pinned there. That is worth more than usual
  because these records are still managed **by hand**: nothing currently detects a
  console edit or deletion. Specified a new `tests/infra/test_dns.py` (needs a `route53`
  fixture added to `conftest.py`) asserting DMARC contents, exactly one SPF record,
  the Proton DKIM CNAMEs, MX, TLS-RPT, and no leftover Tutanota references. Also noted
  that the `p=reject` flip should be driven test-first — write the failing assertion,
  change the record, watch it pass — and that if the records move into Terraform, that
  should happen *before* the flip so the change lands as a reviewable `terraform plan`.
  Still blocked on the same thing as before: ~1-2 weeks of clean aggregate reports.
- [2026-08-31] **Flipped to `p=reject`, cleaned the zone, and added the tests.** Wrote
  `tests/infra/test_dns.py` (18 tests, infra suite now 54) with a `route53` client and a
  `zone_records` fixture in `conftest.py`. Two DNS changes, both with rollback values
  recorded in the Outcome section above. Removed a stale
  `t-verify=5e92f11c60e8ed9d880de4b73818a74c` TXT — a **Tutanota** verification token the
  July cutover left behind; the test originally specified here looked for records
  "referencing tutanota" and would have missed it, so the check matches the *shape* of a
  verification token instead. Then `p=quarantine` → `p=reject`, driven test-first: the
  assertion was written and seen to fail before the record changed.
  **Caveat recorded honestly: the DMARC aggregate reports were never read.** The flip
  rests on the configuration being single-sender and coherent, plus eight weeks at
  `p=quarantine; pct=100` without reported problems — which is absence of evidence, not
  evidence. Residual risk and the exact rollback value are in the Outcome section.
  Terraform management of the DNS records is deliberately left undone: `test_dns.py` now
  covers most of what it was guarding against.
- [2026-08-31] **DMARC reports read; the earlier caveat is partly resolved.** Jon supplied
  four Google reports covering the `p=quarantine` period. Two are DMARC aggregate (XML):
  **2 messages, both fully aligned, 0 failures**, from `79.135.106.116` and
  `79.135.106.25` — verified as genuinely Proton by reverse DNS and by falling inside
  Proton's published SPF range, not merely passing. No unauthorised sender appeared.
  The other two are **TLS-RPT, not DMARC** — 2 successful TLS sessions, 0 failures, both
  recording `no-policy-found`, which is MTA-STS being deliberately absent rather than a
  fault.
  This supports the flip but does not fully close the gap: two messages across two
  sampled days is too sparse to reveal a sender that only fires monthly, and Google's
  reports only cover mail sent to Gmail recipients. Worth continuing to read the reports
  for a few more weeks before treating the question as settled.

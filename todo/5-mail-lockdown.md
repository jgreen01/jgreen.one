# Mail Lockdown (DMARC/SPF/DKIM hardening)

**Priority**: MEDIUM
**Status**: IN_PROGRESS
**Created**: 2026-07-06
**Updated**: 2026-08-30

## Description

On 2026-07-05/06, jgreen.one's email was cut over from Tutanota to ProtonMail (MX, DKIM, SPF records replaced; see Route 53 zone Z01752721Z1AXUQEVQZ2D). The existing `_dmarc.jgreen.one` TXT record (`v=DMARC1; p=quarantine; adkim=s`) predates the cutover and was left as-is to first validate basic deliverability. This task covers hardening DMARC once the basic Proton setup is confirmed working.

## Acceptance Criteria

- [x] Confirm Proton domain verification (MX/DKIM/SPF) fully passed in Proton's dashboard
- [x] Send/receive test mail through the new Proton setup, confirm no deliverability issues
- [x] Add `rua=mailto:dmarc@jgreen.one` to the DMARC record for aggregate reporting
- [x] Decide on and add explicit `aspf` alignment mode (set to `aspf=r`, relaxed; `adkim=s` stays strict)
- [ ] After a validation period (~1-2 weeks) with clean DMARC reports, move `p=quarantine` → `p=reject`
- [x] Add TLS-RPT record (`_smtp._tls.jgreen.one` TXT) for opportunistic-TLS failure reporting
- [x] Decide on catch-all address (Proton paid-plan feature, Settings → Domain names → Set catch-all) — enabled
- [ ] Consider bringing DMARC/SPF/MX records under Terraform management in `infra/live/dns.tf` (currently managed manually outside Terraform)
- [ ] Add `tests/infra/test_dns.py` pinning the mail records, so manual edits and
      Terraform drift both get caught (see Testing below)

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

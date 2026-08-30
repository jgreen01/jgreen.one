# Mail Lockdown (DMARC/SPF/DKIM hardening)

**Priority**: MEDIUM
**Status**: IN_PROGRESS
**Created**: 2026-07-06
**Updated**: 2026-07-06

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

## Notes

Target end-state DMARC record (subject to review before applying):
```
v=DMARC1; p=reject; adkim=s; aspf=r; pct=100; rua=mailto:<address>@jgreen.one
```
Start with `p=quarantine` + `rua` while validating, then bump to `p=reject`.

**MTA-STS researched 2026-07-06: NOT natively supported by Proton for custom domains.** Enabling it requires self-hosting an MTA-STS policy file over HTTPS (valid cert) at `mta-sts.jgreen.one` yourself — Proton doesn't provide one. That's ongoing infra (static file host + cert renewal) for a low-probability threat (active SMTP downgrade MITM) on a personal domain. Decision: deferred / out of scope for this task unless priorities change. If revisited, see community guides: wonderfall.dev/mta-sts, privsec.dev MTA-STS-for-Proton guide, samuel.forestier.app "zero maintenance" approach.

**TLS-RPT researched 2026-07-06: works standalone, no MTA-STS or hosting required** — just a TXT record per RFC 8460. Reports opportunistic-TLS failures for inbound mail. Low effort, added to acceptance criteria above.

**Catch-all researched 2026-07-06: Proton supports it, paid plans only.** Settings → All Settings → Organization → Domain names → Actions → Set catch-all. Proton recommends pointing it at a dedicated address (e.g. `catchall@jgreen.one`), not your main inbox, to avoid clutter.

## Log

- [2026-07-06] Created after ProtonMail cutover; deferring DMARC hardening until basic setup is verified.
- [2026-07-06] Proton dashboard shows domain verified; test email sent/received successfully. Added `rua=mailto:dmarc@jgreen.one`, `aspf=r`, `pct=100` to DMARC record — full value now `v=DMARC1; p=quarantine; adkim=s; aspf=r; pct=100; rua=mailto:dmarc@jgreen.one`. Confirmed live via `dig`. Remaining: wait ~1-2 weeks for clean aggregate reports, then flip to `p=reject`; separately consider moving DNS records into Terraform.
- [2026-07-06] Researched MTA-STS/TLS-RPT/catch-all support in Proton. Added `_smtp._tls.jgreen.one` TXT record `v=TLSRPTv1; rua=mailto:dmarc@jgreen.one` — confirmed live via `dig`. Jon enabled Proton catch-all directly in dashboard. MTA-STS deferred (Proton has no native support; would require self-hosting a policy file/cert).

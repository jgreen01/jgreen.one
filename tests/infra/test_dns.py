"""Pin the mail-related DNS records in Route 53.

These records are managed **by hand** in the console, not by Terraform, so
nothing else in the repository would notice an accidental edit or deletion. That
is what these assertions are for.

Read-only, like the rest of the infra suite. Route 53 is the authority — what the
zone holds. It is not the same question as what the world resolves; use `dig` for
that, since a record can be correct here and still not propagate.
"""

from __future__ import annotations

import re

import pytest

from conftest import SITE_DOMAIN

APEX = f"{SITE_DOMAIN}."


def txt_values(zone_records, name):
    """TXT values for a name, with Route 53's surrounding quotes stripped."""
    raw = zone_records.get((name, "TXT"), [])
    return [value.strip('"') for value in raw]


@pytest.fixture(scope="session")
def dmarc(zone_records):
    values = txt_values(zone_records, f"_dmarc.{APEX}")
    assert len(values) == 1, f"expected exactly one _dmarc TXT record, found {values}"
    return values[0]


class TestDmarc:
    def test_record_exists_and_is_a_dmarc_policy(self, dmarc):
        assert dmarc.startswith("v=DMARC1")

    def test_policy_rejects(self, dmarc):
        # The end state task 5 was working towards. Written before the record was
        # changed, so it failed first and then passed — and it is what stops the
        # policy being quietly loosened back to quarantine later.
        policy = re.search(r"\bp=(\w+)", dmarc).group(1)
        assert policy == "reject", f"DMARC policy is {policy!r}, expected reject"

    def test_aggregate_reports_are_addressed_somewhere(self, dmarc):
        # Without rua there is no feedback at all, and no way to justify ever
        # tightening the policy.
        assert "rua=mailto:" in dmarc

    def test_alignment_modes_are_explicit(self, dmarc):
        assert "adkim=s" in dmarc, "DKIM alignment should be strict"
        assert "aspf=r" in dmarc, "SPF alignment should be relaxed"

    def test_applies_to_all_mail(self, dmarc):
        # pct less than 100 means the policy is only partially applied — fine
        # during a rollout, easy to forget afterwards.
        assert "pct=100" in dmarc


class TestSpf:
    def test_exactly_one_spf_record(self, zone_records):
        # Two SPF records is a permanent error under RFC 7208: receivers must
        # fail the check outright, which silently breaks alignment. It is the
        # easiest thing to get wrong when adding a domain-verification TXT.
        spf = [v for v in txt_values(zone_records, APEX) if v.lower().startswith("v=spf1")]
        assert len(spf) == 1, f"expected exactly one v=spf1 record, found {spf}"

    def test_authorises_proton(self, zone_records):
        [spf] = [v for v in txt_values(zone_records, APEX) if v.lower().startswith("v=spf1")]
        assert "include:_spf.protonmail.ch" in spf

    def test_does_not_end_in_a_permissive_all(self, zone_records):
        # `+all` authorises the entire internet to send as this domain.
        [spf] = [v for v in txt_values(zone_records, APEX) if v.lower().startswith("v=spf1")]
        assert not spf.rstrip().endswith("+all"), "SPF ends in +all, which authorises anyone"
        assert re.search(r"[~-]all\s*$", spf), f"SPF has no terminating all mechanism: {spf!r}"


class TestDkim:
    @pytest.mark.parametrize("selector", ["protonmail", "protonmail2", "protonmail3"])
    def test_selector_points_at_proton(self, zone_records, selector):
        name = f"{selector}._domainkey.{APEX}"
        values = zone_records.get((name, "CNAME"), [])
        assert values, f"missing DKIM CNAME for selector {selector!r}"
        assert "domains.proton.ch" in values[0]


class TestMx:
    def test_mail_is_delivered_to_proton(self, zone_records):
        values = zone_records.get((APEX, "MX"), [])
        assert values, "no MX records — the domain receives no mail"
        assert all("protonmail.ch" in v for v in values), values

    def test_has_a_backup_mx(self, zone_records):
        values = zone_records.get((APEX, "MX"), [])
        assert len(values) >= 2, f"only one MX record: {values}"


class TestTlsRpt:
    def test_record_exists(self, zone_records):
        values = txt_values(zone_records, f"_smtp._tls.{APEX}")
        assert values, "no TLS-RPT record"
        assert values[0].startswith("v=TLSRPTv1")

    def test_reports_are_addressed_somewhere(self, zone_records):
        [value] = txt_values(zone_records, f"_smtp._tls.{APEX}")
        assert "rua=mailto:" in value


class TestNoStaleProviderRecords:
    """Guards against leftovers from the Tutanota → ProtonMail cutover.

    Matching on the provider name alone is not enough: the token this actually
    caught was `t-verify=...`, which never says "tutanota" anywhere. Verification
    tokens are the residue a cutover leaves behind, so check for the shapes as
    well as the names.
    """

    def test_no_mx_points_at_a_former_provider(self, zone_records):
        values = zone_records.get((APEX, "MX"), [])
        assert not any("tuta" in v.lower() for v in values), values

    def test_spf_includes_no_former_provider(self, zone_records):
        spf = [v for v in txt_values(zone_records, APEX) if v.lower().startswith("v=spf1")]
        assert not any("tuta" in v.lower() for v in spf), spf

    def test_no_orphaned_verification_tokens(self, zone_records):
        # A verification token is only needed while a provider is being set up.
        # Anything still here from a provider no longer in the MX is dead weight
        # and a small information leak about past infrastructure.
        known_current = ("protonmail-verification",)
        stale = [
            value
            for value in txt_values(zone_records, APEX)
            if re.match(r"^[\w-]*(verify|verification)=", value, re.I)
            and not value.startswith(known_current)
        ]
        assert not stale, f"stale verification token(s) left in the zone: {stale}"

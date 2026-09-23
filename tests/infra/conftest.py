"""Shared fixtures for the infrastructure test suite.

These tests run against **real AWS resources** and are therefore opt-in: they are
never part of `npm test`. Every call here is read-only — `describe_*`, `get_*`,
`list_*` — so a run can never mutate infrastructure.

Run locally after `terraform apply`:

    pytest tests/infra -v

The whole suite skips cleanly when no usable credentials are present, so a
checkout without AWS access does not fail.
"""

from __future__ import annotations

import os

import boto3
import pytest
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

# Resources defined in infra/live/. Overridable so the suite can be pointed at a
# non-production stack without editing the tests.
# Deliberately has no default. An account ID is an identifier we keep out of a
# public repository, so the guard that refuses to assert against the wrong
# account is opt-in: export JGREEN_AWS_ACCOUNT_ID to enable it. Without it that
# one assertion skips and the rest of the suite runs unchanged.
EXPECTED_ACCOUNT_ID = os.environ.get("JGREEN_AWS_ACCOUNT_ID")
SITE_DOMAIN = os.environ.get("JGREEN_SITE_DOMAIN", "jgreen.one")
SITE_BUCKET = os.environ.get("JGREEN_SITE_BUCKET", "jgreen-one-site")
WAF_NAME = os.environ.get("JGREEN_WAF_NAME", "jgreen-one-waf")
SNS_TOPIC_NAME = os.environ.get("JGREEN_SNS_TOPIC", "jgreen-one-billing-alerts")
BUDGET_NAME = os.environ.get("JGREEN_BUDGET_NAME", "jgreen-one-monthly-budget")
# No default. The ID is looked up from Route 53 by domain name on every run (see
# the hosted_zone_id fixture) rather than hardcoded: it changes if the zone is
# ever recreated. The env var remains for pointing the suite at another stack.
HOSTED_ZONE_ID = os.environ.get("JGREEN_HOSTED_ZONE_ID")

# CloudFront, WAF for CloudFront, billing metrics and Budgets are all global
# services addressed through us-east-1.
GLOBAL_REGION = "us-east-1"


@pytest.fixture(scope="session")
def sts_identity():
    """Caller identity, or skip the suite when AWS is unreachable."""
    try:
        return boto3.client("sts", region_name=GLOBAL_REGION).get_caller_identity()
    except (NoCredentialsError, ClientError, BotoCoreError) as exc:
        pytest.skip(f"AWS credentials unavailable, skipping infra tests: {exc}")


@pytest.fixture(scope="session")
def account_id(sts_identity) -> str:
    return sts_identity["Account"]


@pytest.fixture(scope="session")
def cloudfront(sts_identity):
    return boto3.client("cloudfront", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def s3(sts_identity):
    return boto3.client("s3", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def wafv2(sts_identity):
    return boto3.client("wafv2", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def sns(sts_identity):
    return boto3.client("sns", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def cloudwatch(sts_identity):
    return boto3.client("cloudwatch", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def budgets(sts_identity):
    return boto3.client("budgets", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def route53(sts_identity):
    return boto3.client("route53", region_name=GLOBAL_REGION)


@pytest.fixture(scope="session")
def hosted_zone_id(route53):
    """The site's public hosted zone, found by domain name rather than hardcoded.

    Looked up fresh each run, because the ID changes if the zone is recreated.
    JGREEN_HOSTED_ZONE_ID overrides it, for pointing the suite at another stack.
    """
    if HOSTED_ZONE_ID:
        return HOSTED_ZONE_ID
    wanted = f"{SITE_DOMAIN}."
    # Results start at SITE_DOMAIN in lexical order and may run past it, so
    # match the name exactly, and ignore any private zone of the same name.
    zones = route53.list_hosted_zones_by_name(DNSName=SITE_DOMAIN)["HostedZones"]
    matches = [z for z in zones if z["Name"] == wanted and not z["Config"]["PrivateZone"]]
    if len(matches) != 1:
        pytest.fail(f"expected exactly one public hosted zone named {wanted}, found {len(matches)}")
    return matches[0]["Id"].split("/")[-1]


@pytest.fixture(scope="session")
def zone_records(route53, hosted_zone_id):
    """Every record in the hosted zone, keyed by ``(name, type)``.

    Names keep their trailing dot as Route 53 returns them; values are the raw
    ``Value`` strings, so TXT records arrive still wrapped in quotes.

    The mail records are managed by hand rather than by Terraform, so nothing
    else would notice a console edit or an accidental deletion. That is the
    reason these assertions exist.
    """
    records = {}
    paginator = route53.get_paginator("list_resource_record_sets")
    for page in paginator.paginate(HostedZoneId=hosted_zone_id):
        for record in page["ResourceRecordSets"]:
            key = (record["Name"], record["Type"])
            values = [r["Value"] for r in record.get("ResourceRecords", [])]
            records.setdefault(key, []).extend(values)
    return records


@pytest.fixture(scope="session")
def distribution_summary(cloudfront):
    """The CloudFront distribution serving the site, found by its alias.

    Looked up by domain rather than by a hardcoded distribution id so the suite
    survives the distribution being replaced.
    """
    paginator = cloudfront.get_paginator("list_distributions")
    for page in paginator.paginate():
        for item in page.get("DistributionList", {}).get("Items", []):
            aliases = item.get("Aliases", {}).get("Items", [])
            if SITE_DOMAIN in aliases:
                return item
    pytest.fail(f"No CloudFront distribution has {SITE_DOMAIN} as an alias")


@pytest.fixture(scope="session")
def distribution(cloudfront, distribution_summary):
    """Full distribution config, which carries WebACLId and origin details."""
    return cloudfront.get_distribution(Id=distribution_summary["Id"])["Distribution"]


@pytest.fixture(scope="session")
def web_acl(wafv2):
    """The CloudFront-scoped WAF Web ACL, fetched in full."""
    acls = wafv2.list_web_acls(Scope="CLOUDFRONT", Limit=100)["WebACLs"]
    match = next((acl for acl in acls if acl["Name"] == WAF_NAME), None)
    if match is None:
        pytest.fail(f"WAF Web ACL {WAF_NAME!r} not found in scope CLOUDFRONT")
    return wafv2.get_web_acl(Name=WAF_NAME, Scope="CLOUDFRONT", Id=match["Id"])["WebACL"]


@pytest.fixture(scope="session")
def alarms(cloudwatch):
    """Billing alarms keyed by alarm name."""
    found = {}
    paginator = cloudwatch.get_paginator("describe_alarms")
    for page in paginator.paginate(AlarmNamePrefix="jgreen-one-"):
        for alarm in page["MetricAlarms"]:
            found[alarm["AlarmName"]] = alarm
    return found

"""Assert the deployed AWS resources match what infra/live/ declares.

Read-only. Run after `terraform apply`, or via the manually-triggered `infra`
CI job. See conftest.py for credentials handling and resource discovery.
"""

from __future__ import annotations

import pytest
from botocore.exceptions import ClientError

from conftest import (
    BUDGET_NAME,
    EXPECTED_ACCOUNT_ID,
    SITE_BUCKET,
    SITE_DOMAIN,
    SNS_TOPIC_NAME,
    WAF_NAME,
)


class TestAccount:
    def test_running_against_the_expected_account(self, account_id):
        assert account_id == EXPECTED_ACCOUNT_ID, (
            f"Connected to account {account_id}, expected {EXPECTED_ACCOUNT_ID}. "
            "Refusing to assert against the wrong account."
        )


class TestCloudFront:
    def test_distribution_is_deployed(self, distribution):
        assert distribution["Status"] == "Deployed"

    def test_distribution_is_enabled(self, distribution):
        assert distribution["DistributionConfig"]["Enabled"] is True

    def test_serves_the_apex_and_www_aliases(self, distribution):
        aliases = distribution["DistributionConfig"]["Aliases"]["Items"]
        assert SITE_DOMAIN in aliases
        assert f"www.{SITE_DOMAIN}" in aliases

    def test_web_acl_is_attached_and_matches_the_waf(self, distribution, web_acl):
        attached = distribution["DistributionConfig"].get("WebACLId", "")
        assert attached, "No WAF Web ACL is attached to the distribution"
        assert attached == web_acl["ARN"], (
            f"Distribution points at {attached!r}, but {WAF_NAME} is {web_acl['ARN']!r}"
        )

    def test_viewers_are_redirected_to_https(self, distribution):
        behaviour = distribution["DistributionConfig"]["DefaultCacheBehavior"]
        assert behaviour["ViewerProtocolPolicy"] in {"redirect-to-https", "https-only"}

    def test_origin_uses_origin_access_control(self, distribution):
        origins = distribution["DistributionConfig"]["Origins"]["Items"]
        site_origin = next(o for o in origins if SITE_BUCKET in o["DomainName"])
        assert site_origin.get("OriginAccessControlId"), (
            "S3 origin is not fronted by an Origin Access Control"
        )

    def test_uses_the_cheapest_price_class(self, distribution):
        assert distribution["DistributionConfig"]["PriceClass"] == "PriceClass_100"


class TestSiteBucket:
    def test_all_public_access_is_blocked(self, s3):
        config = s3.get_public_access_block(Bucket=SITE_BUCKET)[
            "PublicAccessBlockConfiguration"
        ]
        for setting in (
            "BlockPublicAcls",
            "BlockPublicPolicy",
            "IgnorePublicAcls",
            "RestrictPublicBuckets",
        ):
            assert config[setting] is True, f"{setting} is not enabled on {SITE_BUCKET}"

    def test_versioning_is_enabled(self, s3):
        # Versioning is the recovery path for an accidental `s3 sync --delete`,
        # and task 6 relies on it as the durable copy for media assets.
        status = s3.get_bucket_versioning(Bucket=SITE_BUCKET).get("Status")
        assert status == "Enabled"

    def test_default_encryption_is_configured(self, s3):
        rules = s3.get_bucket_encryption(Bucket=SITE_BUCKET)[
            "ServerSideEncryptionConfiguration"
        ]["Rules"]
        algorithms = {
            rule["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] for rule in rules
        }
        assert algorithms & {"AES256", "aws:kms"}

    def test_bucket_is_not_publicly_readable(self, s3):
        try:
            status = s3.get_bucket_policy_status(Bucket=SITE_BUCKET)["PolicyStatus"]
        except ClientError as exc:
            if exc.response["Error"]["Code"] in {"NoSuchBucketPolicy"}:
                return  # No policy at all is also not public.
            raise
        assert status["IsPublic"] is False


class TestWaf:
    def test_web_acl_exists(self, web_acl):
        assert web_acl["Name"] == WAF_NAME

    def test_default_action_is_allow(self, web_acl):
        assert "Allow" in web_acl["DefaultAction"]

    def test_has_a_rate_limit_rule(self, web_acl):
        rules = [r for r in web_acl["Rules"] if "RateBasedStatement" in r["Statement"]]
        assert rules, "No rate-based rule found on the Web ACL"

    def test_rate_limit_is_1000_requests_per_300_seconds(self, web_acl):
        rule = next(r for r in web_acl["Rules"] if "RateBasedStatement" in r["Statement"])
        statement = rule["Statement"]["RateBasedStatement"]

        assert statement["Limit"] == 1000
        # AWS defaults the evaluation window to 300s when Terraform omits it.
        assert statement.get("EvaluationWindowSec", 300) == 300
        assert statement["AggregateKeyType"] == "IP"

    def test_rate_limit_rule_blocks(self, web_acl):
        rule = next(r for r in web_acl["Rules"] if "RateBasedStatement" in r["Statement"])
        assert "Block" in rule["Action"]

    def test_metrics_are_enabled(self, web_acl):
        assert web_acl["VisibilityConfig"]["CloudWatchMetricsEnabled"] is True


class TestBillingAlerts:
    def test_sns_topic_exists(self, sns, account_id):
        expected = f"arn:aws:sns:us-east-1:{account_id}:{SNS_TOPIC_NAME}"
        arns = []
        paginator = sns.get_paginator("list_topics")
        for page in paginator.paginate():
            arns.extend(topic["TopicArn"] for topic in page["Topics"])
        assert expected in arns

    def test_sns_topic_has_a_confirmed_subscription(self, sns, account_id):
        arn = f"arn:aws:sns:us-east-1:{account_id}:{SNS_TOPIC_NAME}"
        subs = sns.list_subscriptions_by_topic(TopicArn=arn)["Subscriptions"]
        assert subs, "Billing alerts topic has no subscriptions — alarms notify nobody"
        assert any(
            s["SubscriptionArn"] != "PendingConfirmation" for s in subs
        ), "Every subscription is still pending confirmation"

    @pytest.mark.parametrize(
        ("alarm_name", "threshold"),
        [
            ("jgreen-one-cloudfront-cost", 5.0),
            ("jgreen-one-s3-cost", 2.0),
            ("jgreen-one-route53-cost", 1.0),
            ("jgreen-one-total-cost", 15.0),
        ],
    )
    def test_cost_alarm_threshold(self, alarms, alarm_name, threshold):
        assert alarm_name in alarms, f"Alarm {alarm_name} does not exist"
        assert alarms[alarm_name]["Threshold"] == threshold

    def test_exactly_four_cost_alarms_exist(self, alarms):
        cost_alarms = {name for name in alarms if name.endswith("-cost")}
        assert len(cost_alarms) == 4, f"Expected 4 cost alarms, found {sorted(cost_alarms)}"

    @pytest.mark.parametrize(
        "alarm_name",
        [
            "jgreen-one-cloudfront-cost",
            "jgreen-one-s3-cost",
            "jgreen-one-route53-cost",
            "jgreen-one-total-cost",
        ],
    )
    def test_alarm_notifies_the_billing_topic(self, alarms, alarm_name, account_id):
        expected = f"arn:aws:sns:us-east-1:{account_id}:{SNS_TOPIC_NAME}"
        assert expected in alarms[alarm_name]["AlarmActions"]

    @pytest.mark.parametrize(
        "alarm_name",
        [
            "jgreen-one-cloudfront-cost",
            "jgreen-one-s3-cost",
            "jgreen-one-route53-cost",
            "jgreen-one-total-cost",
        ],
    )
    def test_alarm_watches_estimated_charges(self, alarms, alarm_name):
        alarm = alarms[alarm_name]
        assert alarm["MetricName"] == "EstimatedCharges"
        assert alarm["Namespace"] == "AWS/Billing"


class TestBudget:
    def test_monthly_budget_is_twenty_dollars(self, budgets, account_id):
        budget = budgets.describe_budget(AccountId=account_id, BudgetName=BUDGET_NAME)[
            "Budget"
        ]
        assert budget["BudgetLimit"]["Amount"].startswith("20")
        assert budget["BudgetLimit"]["Unit"] == "USD"

    def test_budget_is_a_monthly_cost_budget(self, budgets, account_id):
        budget = budgets.describe_budget(AccountId=account_id, BudgetName=BUDGET_NAME)[
            "Budget"
        ]
        assert budget["BudgetType"] == "COST"
        assert budget["TimeUnit"] == "MONTHLY"

    def test_budget_has_notifications_configured(self, budgets, account_id):
        notifications = budgets.describe_notifications_for_budget(
            AccountId=account_id, BudgetName=BUDGET_NAME
        )["Notifications"]
        assert notifications, "Budget has no notifications — it will alert nobody"

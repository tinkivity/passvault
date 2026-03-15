import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

interface SesNotifierConstructProps {
  // SNS topic whose messages should be forwarded by email.
  topic: sns.Topic;
  // Recipient email address.
  alertEmail: string;
  // Subdomain from which to send (e.g. 'pv.example.com' or 'beta.pv.example.com').
  // An SES domain identity is created for this domain.
  senderDomain: string;
  // Root domain used to look up the Route53 hosted zone (e.g. 'example.com').
  rootDomain: string;
  environment: string;
  logRetentionDays: logs.RetentionDays;
}

// Wires an SNS topic to SES email delivery.
//
// Creates an SES domain identity for senderDomain and adds all required
// Route53 DNS records (DKIM CNAMEs, SPF TXT, MX, DMARC) to the root
// hosted zone. All records are destroyed on cdk destroy.
//
// A Lambda function subscribes to the topic, formats the SNS notification
// into a readable email, and sends it via SES.
export class SesNotifierConstruct extends Construct {
  public readonly emailIdentity: ses.EmailIdentity;
  public readonly senderDomain: string;

  constructor(scope: Construct, id: string, props: SesNotifierConstructProps) {
    super(scope, id);

    const { topic, alertEmail, senderDomain, rootDomain, environment, logRetentionDays } = props;

    // Hosted zone for the root domain — records for senderDomain subdomains
    // are created here since Route53 serves all subdomains from the apex zone.
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: rootDomain,
    });

    this.senderDomain = senderDomain;

    // SES domain identity for the sender subdomain.
    // mailFromDomain sets a dedicated MAIL FROM subdomain so SPF and bounce
    // feedback are scoped to that subdomain rather than the envelope domain.
    this.emailIdentity = new ses.EmailIdentity(this, 'EmailIdentity', {
      identity: ses.Identity.domain(senderDomain),
      mailFromDomain: `mail.${senderDomain}`,
    });

    // Sender domain relative to the root hosted zone.
    // e.g. senderDomain="beta.pv.example.com", rootDomain="example.com" → "beta.pv"
    // Used to build relative Route53 record names (CDK appends the zone name itself).
    const relativeSenderDomain = senderDomain.slice(0, -(rootDomain.length + 1));

    // DKIM CNAME records — three tokens required by SES for DKIM signing.
    //
    // NOTE: dkimRecords[i].name is a CloudFormation token, not a plain string.
    // CDK's Route53 constructs always append the zone name to unresolved tokens,
    // which would produce "selector._domainkey.beta.pv.example.com.example.com".
    // Fix: extract the selector prefix from record.value (a plain CFN intrinsic)
    // and construct a relative record name so CDK appends the zone name correctly.
    this.emailIdentity.dkimRecords.forEach((record, i) => {
      const selector = cdk.Fn.select(0, cdk.Fn.split('.', record.value));
      new route53.CnameRecord(this, `DkimRecord${i}`, {
        zone: hostedZone,
        recordName: `${selector}._domainkey.${relativeSenderDomain}`,
        domainName: record.value,
        ttl: cdk.Duration.hours(1),
      });
    });

    // SPF for the MAIL FROM subdomain — authorises SES to send on its behalf.
    new route53.TxtRecord(this, 'SpfRecord', {
      zone: hostedZone,
      recordName: `mail.${senderDomain}`,
      values: ['v=spf1 include:amazonses.com ~all'],
      ttl: cdk.Duration.hours(1),
    });

    // MX for the MAIL FROM subdomain — routes bounces back to SES.
    new route53.MxRecord(this, 'MxRecord', {
      zone: hostedZone,
      recordName: `mail.${senderDomain}`,
      values: [{
        priority: 10,
        hostName: `feedback-smtp.${cdk.Stack.of(this).region}.amazonses.com`,
      }],
      ttl: cdk.Duration.hours(1),
    });

    // DMARC — instructs receivers to quarantine mail that fails SPF/DKIM,
    // and sends aggregate reports to the alert address.
    new route53.TxtRecord(this, 'DmarcRecord', {
      zone: hostedZone,
      recordName: `_dmarc.${senderDomain}`,
      values: ['v=DMARC1; p=none;'],
      ttl: cdk.Duration.hours(1),
    });

    // Lambda notifier
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `/aws/lambda/passvault-ses-notifier-${environment}`,
      retention: logRetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const notifierFn = new lambda.Function(this, 'Fn', {
      functionName: `passvault-ses-notifier-${environment}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'ses-notifier.handler',
      code: lambda.Code.fromAsset('../backend/dist/ses-notifier'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      logGroup,
      environment: {
        SENDER_EMAIL: `alerts@${senderDomain}`,
        ALERT_EMAIL: alertEmail,
      },
    });

    notifierFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [this.emailIdentity.emailIdentityArn],
    }));

    topic.addSubscription(new sns_subscriptions.LambdaSubscription(notifierFn));
  }
}

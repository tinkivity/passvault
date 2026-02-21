import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

interface CertificateStackProps extends cdk.StackProps {
  domain: string;
  subdomain: string;
}

export class CertificateStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const fullDomain = `${props.subdomain}.${props.domain}`;

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.domain,
    });

    // CloudFront requires ACM certificates in us-east-1.
    // This stack must be deployed with env: { region: 'us-east-1' }.
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: fullDomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}

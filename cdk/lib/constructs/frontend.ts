import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';

interface FrontendConstructProps {
  config: EnvironmentConfig;
  frontendBucket: s3.Bucket;
  api: apigateway.RestApi;
  certificate?: acm.ICertificate;
  domain?: string;
}

export class FrontendConstruct extends Construct {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendConstructProps) {
    super(scope, id);

    const { config, frontendBucket, api, certificate, domain } = props;
    const env = config.environment;
    const fullDomain = domain ? `${config.subdomain}.${domain}` : undefined;

    // API Gateway origin — strip the stage name from the path
    const apiDomainName = `${api.restApiId}.execute-api.${config.region}.amazonaws.com`;
    const apiOrigin = new origins.HttpOrigin(apiDomainName, {
      originPath: `/${env}`,
    });

    // CloudFront Function for SPA routing.
    // Rewrites any request whose URI has no file extension to /index.html so
    // that React Router routes (e.g. /admin-login, /vault) are served by the
    // SPA entry point.  Static assets (e.g. /assets/index-abc.js) pass through
    // unchanged.  This runs on the default (S3) behavior only — API paths
    // (/admin/*, /auth/*, etc.) are matched by more-specific behaviors first
    // and never reach this function, so API 4xx responses are never rewritten.
    const spaFunction = new cloudfront.Function(this, 'SpaFunction', {
      functionName: `passvault-spa-${env}`,
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        `async function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.lastIndexOf('.') > uri.lastIndexOf('/')) { return request; }
  request.uri = '/index.html';
  return request;
}`,
      ),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `PassVault CDN - ${env}`,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...(fullDomain && certificate ? { domainNames: [fullDomain], certificate } : {}),

      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [{
          function: spaFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },

      additionalBehaviors: {
        // All API requests live under /api/* — no SPA routes share this prefix,
        // so browser navigations to /admin/*, /vault, etc. fall through to S3.
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },

    });

    if (fullDomain && domain) {
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: domain,
      });
      const record = new route53.ARecord(this, 'DnsRecord', {
        zone: hostedZone,
        recordName: config.subdomain,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
      record.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}

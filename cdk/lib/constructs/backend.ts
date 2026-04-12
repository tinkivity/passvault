import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { resolve } from 'path';
import type { EnvironmentConfig } from '@passvault/shared';
import type { StorageConstruct } from './storage.js';

// Resolve asset paths relative to this source file so they work regardless of
// process.cwd() (tsx / vitest both run from the source location).
// cdk/lib/constructs/ → cdk/ → backend/dist/
const BACKEND_DIST = resolve(__dirname, '../../../backend/dist');
const dist = (name: string) => lambda.Code.fromAsset(resolve(BACKEND_DIST, name));

interface BackendConstructProps {
  config: EnvironmentConfig;
  storage: StorageConstruct;
  /** Root domain (e.g. `example.com`). Used to auto-derive passkey RP ID/origin when not explicitly set. */
  domain?: string;
}

export class BackendConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly challengeFn: lambda.Function;
  public readonly authFn: lambda.Function;
  public readonly adminAuthFn: lambda.Function;
  public readonly adminMgmtFn: lambda.Function;
  public readonly vaultFn: lambda.Function;
  public readonly healthFn: lambda.Function;
  public readonly digestFn: lambda.Function;

  /**
   * All API Gateway-facing Lambda functions, in a stable order.
   * Used by the kill switch (set concurrency to 0), CORS/env var loops,
   * and monitoring constructs. Does NOT include digestFn (EventBridge-scheduled).
   *
   * When adding a new API-facing Lambda, add it here — the CDK test suite
   * verifies this array stays in sync with the actual Lambda count.
   */
  public readonly allApiFunctions: lambda.Function[];

  constructor(scope: Construct, id: string, props: BackendConstructProps) {
    super(scope, id);

    const { config, storage } = props;
    const env = config.environment;

    // JWT signing secret — stored in SSM Parameter Store as a SecureString.
    // Create once manually (or via bootstrap script):
    //   aws ssm put-parameter --name /passvault/<env>/jwt-secret \
    //     --value "$(openssl rand -hex 32)" --type SecureString
    const jwtSecretParamName = `/passvault/${env}/jwt-secret`;
    const jwtSecretParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'JwtSecretParam',
      { parameterName: jwtSecretParamName },
    );

    const commonEnv: Record<string, string> = {
      ENVIRONMENT: env,
      DYNAMODB_TABLE: storage.usersTable.tableName,
      FILES_BUCKET: storage.filesBucket.bucketName,
      VAULTS_TABLE_NAME: storage.vaultsTable.tableName,

    };

    const runtime = lambda.Runtime.NODEJS_22_X;
    const architecture = lambda.Architecture.ARM_64;
    const defaultMemory = config.lambda.memorySize;
    const defaultTimeout = cdk.Duration.seconds(config.lambda.timeout);

    const retentionDays = config.monitoring.logRetentionDays as logs.RetentionDays;

    // Reserved concurrency is only set in prod to cap blast radius.
    // In dev/beta, Lambda draws from the unreserved account pool — this avoids
    // failing on new accounts where the concurrency quota can be as low as 10.
    const isProd = env === 'prod';

    // Challenge Lambda
    const challengeLogGroup = new logs.LogGroup(this, 'ChallengeLogs', {
      logGroupName: `/aws/lambda/passvault-challenge-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.challengeFn = new lambda.Function(this, 'ChallengeFn', {
      runtime,
      architecture,
      functionName: `passvault-challenge-${env}`,
      handler: 'challenge.handler',
      code: dist('challenge'),
      environment: commonEnv,
      memorySize: 256,
      timeout: cdk.Duration.seconds(5),
      logGroup: challengeLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 5 }),
    });

    // Auth Lambda
    const authLogGroup = new logs.LogGroup(this, 'AuthLogs', {
      logGroupName: `/aws/lambda/passvault-auth-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.authFn = new lambda.Function(this, 'AuthFn', {
      runtime,
      architecture,
      functionName: `passvault-auth-${env}`,
      handler: 'auth.handler',
      code: dist('auth'),
      environment: commonEnv,
      memorySize: defaultMemory,
      timeout: cdk.Duration.seconds(10),
      logGroup: authLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 3 }),
    });

    // Admin Auth Lambda
    const adminAuthLogGroup = new logs.LogGroup(this, 'AdminAuthLogs', {
      logGroupName: `/aws/lambda/passvault-admin-auth-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.adminAuthFn = new lambda.Function(this, 'AdminAuthFn', {
      runtime,
      architecture,
      functionName: `passvault-admin-auth-${env}`,
      handler: 'admin-auth.handler',
      code: dist('admin-auth'),
      environment: commonEnv,
      memorySize: defaultMemory,
      timeout: cdk.Duration.seconds(10),
      logGroup: adminAuthLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 3 }),
    });

    // Admin Management Lambda
    const adminMgmtLogGroup = new logs.LogGroup(this, 'AdminMgmtLogs', {
      logGroupName: `/aws/lambda/passvault-admin-mgmt-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.adminMgmtFn = new lambda.Function(this, 'AdminMgmtFn', {
      runtime,
      architecture,
      functionName: `passvault-admin-mgmt-${env}`,
      handler: 'admin-management.handler',
      code: dist('admin-management'),
      environment: commonEnv,
      memorySize: defaultMemory,
      timeout: cdk.Duration.seconds(10),
      logGroup: adminMgmtLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 2 }),
    });

    // Vault Lambda
    const vaultLogGroup = new logs.LogGroup(this, 'VaultLogs', {
      logGroupName: `/aws/lambda/passvault-vault-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.vaultFn = new lambda.Function(this, 'VaultFn', {
      runtime,
      architecture,
      functionName: `passvault-vault-${env}`,
      handler: 'vault.handler',
      code: dist('vault'),
      environment: commonEnv,
      memorySize: defaultMemory,
      timeout: defaultTimeout,
      logGroup: vaultLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 5 }),
    });

    // Health Lambda
    const healthLogGroup = new logs.LogGroup(this, 'HealthLogs', {
      logGroupName: `/aws/lambda/passvault-health-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.healthFn = new lambda.Function(this, 'HealthFn', {
      runtime,
      architecture,
      functionName: `passvault-health-${env}`,
      handler: 'health.handler',
      code: dist('health'),
      environment: commonEnv,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      logGroup: healthLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 2 }),
    });

    // Canonical list of all API-facing Lambdas (see JSDoc on allApiFunctions).
    this.allApiFunctions = [
      this.challengeFn,
      this.authFn,
      this.adminAuthFn,
      this.adminMgmtFn,
      this.vaultFn,
      this.healthFn,
    ];

    // SSM: pass parameter name (not value) to Lambdas that sign/verify tokens.
    // The Lambda fetches and decrypts the value at cold-start via the SSM API.
    this.authFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);
    this.adminAuthFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);
    this.adminMgmtFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);
    this.vaultFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);

    // Passkey (WebAuthn) relying-party configuration.
    // Resolution order: explicit context → env var → auto-derived from domain + config.subdomain.
    // Auto-derived example: domain=example.com, subdomain=beta.pv → rpId=beta.pv.example.com, origin=https://beta.pv.example.com
    if (config.features.passkeyRequired) {
      const derivedHost = props.domain ? `${config.subdomain}.${props.domain}` : '';
      const rpId = this.node.tryGetContext('passkeyRpId') as string | undefined ?? process.env.PASSKEY_RP_ID ?? derivedHost;
      const origin = this.node.tryGetContext('passkeyOrigin') as string | undefined ?? process.env.PASSKEY_ORIGIN ?? (derivedHost ? `https://${derivedHost}` : '');
      this.authFn.addEnvironment('PASSKEY_RP_ID', rpId);
      this.authFn.addEnvironment('PASSKEY_ORIGIN', origin);
      this.adminAuthFn.addEnvironment('PASSKEY_RP_ID', rpId);
      this.adminAuthFn.addEnvironment('PASSKEY_ORIGIN', origin);
    }
    jwtSecretParam.grantRead(this.authFn);
    jwtSecretParam.grantRead(this.adminAuthFn);
    jwtSecretParam.grantRead(this.adminMgmtFn);
    jwtSecretParam.grantRead(this.vaultFn);

    // IAM: grant DynamoDB access to auth, admin, vault
    storage.usersTable.grantReadWriteData(this.authFn);
    storage.usersTable.grantReadWriteData(this.adminAuthFn);
    storage.usersTable.grantReadWriteData(this.adminMgmtFn);
    storage.usersTable.grantReadWriteData(this.vaultFn);

    // IAM: login events table (deprecated) — auth + admin-auth write, admin-mgmt reads
    storage.loginEventsTable.grantWriteData(this.authFn);
    storage.loginEventsTable.grantWriteData(this.adminAuthFn);
    storage.loginEventsTable.grantReadData(this.adminMgmtFn);

    // Pass login events table name to auth + admin Lambdas (deprecated)
    this.authFn.addEnvironment('LOGIN_EVENTS_TABLE_NAME', storage.loginEventsTable.tableName);
    this.adminAuthFn.addEnvironment('LOGIN_EVENTS_TABLE_NAME', storage.loginEventsTable.tableName);
    this.adminMgmtFn.addEnvironment('LOGIN_EVENTS_TABLE_NAME', storage.loginEventsTable.tableName);

    // IAM: audit events table — auth, admin-auth, admin-mgmt all read/write
    storage.auditEventsTable.grantReadWriteData(this.authFn);
    storage.auditEventsTable.grantReadWriteData(this.adminAuthFn);
    storage.auditEventsTable.grantReadWriteData(this.adminMgmtFn);
    storage.auditEventsTable.grantReadWriteData(this.vaultFn);

    // IAM: config table — admin-mgmt reads/writes, auth + admin-auth read
    storage.configTable.grantReadData(this.authFn);
    storage.configTable.grantReadData(this.adminAuthFn);
    storage.configTable.grantReadWriteData(this.adminMgmtFn);
    storage.configTable.grantReadData(this.vaultFn);

    // Pass audit and config table names to Lambdas
    this.authFn.addEnvironment('AUDIT_EVENTS_TABLE', storage.auditEventsTable.tableName);
    this.adminAuthFn.addEnvironment('AUDIT_EVENTS_TABLE', storage.auditEventsTable.tableName);
    this.adminMgmtFn.addEnvironment('AUDIT_EVENTS_TABLE', storage.auditEventsTable.tableName);
    this.vaultFn.addEnvironment('AUDIT_EVENTS_TABLE', storage.auditEventsTable.tableName);
    this.authFn.addEnvironment('CONFIG_TABLE', storage.configTable.tableName);
    this.adminAuthFn.addEnvironment('CONFIG_TABLE', storage.configTable.tableName);
    this.adminMgmtFn.addEnvironment('CONFIG_TABLE', storage.configTable.tableName);
    this.vaultFn.addEnvironment('CONFIG_TABLE', storage.configTable.tableName);

    // IAM: passkey credentials table — auth + admin-auth read/write
    storage.passkeyCredentialsTable.grantReadWriteData(this.authFn);
    storage.passkeyCredentialsTable.grantReadWriteData(this.adminAuthFn);
    storage.passkeyCredentialsTable.grantReadWriteData(this.adminMgmtFn);
    this.authFn.addEnvironment('PASSKEY_CREDENTIALS_TABLE_NAME', storage.passkeyCredentialsTable.tableName);
    this.adminAuthFn.addEnvironment('PASSKEY_CREDENTIALS_TABLE_NAME', storage.passkeyCredentialsTable.tableName);
    this.adminMgmtFn.addEnvironment('PASSKEY_CREDENTIALS_TABLE_NAME', storage.passkeyCredentialsTable.tableName);

    // IAM: grant vaults table access to vault + admin-mgmt Lambdas
    storage.vaultsTable.grantReadWriteData(this.vaultFn);
    storage.vaultsTable.grantReadWriteData(this.adminMgmtFn);

    // IAM: grant S3 file access to vault
    storage.filesBucket.grantReadWrite(this.vaultFn);

    // IAM: grant S3 file read+write to admin-mgmt (creates empty vault on invite, downloads vault for backup)
    storage.filesBucket.grantReadWrite(this.adminMgmtFn);

    // IAM: grant email templates bucket access
    // Read-only for Lambdas that send emails; read+write for admin-mgmt (template management API)
    storage.templatesBucket.grantRead(this.authFn);
    storage.templatesBucket.grantRead(this.vaultFn);
    storage.templatesBucket.grantReadWrite(this.adminMgmtFn);

    // Pass templates bucket name to email-sending Lambdas
    this.authFn.addEnvironment('TEMPLATES_BUCKET', storage.templatesBucket.bucketName);
    this.adminMgmtFn.addEnvironment('TEMPLATES_BUCKET', storage.templatesBucket.bucketName);
    this.vaultFn.addEnvironment('TEMPLATES_BUCKET', storage.templatesBucket.bucketName);

    // Digest Lambda — scheduled daily at 01:00 UTC, sends failed-login digests and vault backups
    const digestLogGroup = new logs.LogGroup(this, 'DigestLogs', {

      logGroupName: `/aws/lambda/passvault-digest-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.digestFn = new lambda.Function(this, 'DigestFn', {
      runtime,
      architecture,
      functionName: `passvault-digest-${env}`,
      handler: 'digest.handler',
      code: dist('digest'),
      environment: {
        ...commonEnv,
        LOGIN_EVENTS_TABLE_NAME: storage.loginEventsTable.tableName,
      },
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      logGroup: digestLogGroup,
    });
    // Digest needs JWT for signing unsubscribe tokens
    this.digestFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);
    jwtSecretParam.grantRead(this.digestFn);
    storage.usersTable.grantReadWriteData(this.digestFn);
    storage.loginEventsTable.grantReadData(this.digestFn);
    storage.vaultsTable.grantReadData(this.digestFn);
    storage.filesBucket.grantRead(this.digestFn);
    storage.templatesBucket.grantRead(this.digestFn);
    this.digestFn.addEnvironment('TEMPLATES_BUCKET', storage.templatesBucket.bucketName);

    // EventBridge rule: run digest daily at 01:00 UTC
    new events.Rule(this, 'DigestSchedule', {
      ruleName: `passvault-digest-schedule-${env}`,
      schedule: events.Schedule.cron({ minute: '0', hour: '1' }),
      targets: [new eventsTargets.LambdaFunction(this.digestFn)],
    });

    // Seed default email templates into S3 (prune: false → never deletes admin-uploaded templates)
    new s3deploy.BucketDeployment(this, 'SeedEmailTemplates', {
      sources: [s3deploy.Source.asset(resolve(__dirname, '../../assets/email-templates'))],
      destinationBucket: storage.templatesBucket,
      destinationKeyPrefix: 'templates',
      prune: false,
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `passvault-api-${env}`,
      deployOptions: {
        stageName: env,
        throttlingBurstLimit: config.throttle.burstLimit,
        throttlingRateLimit: config.throttle.rateLimit,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Pow-Solution',
          'X-Pow-Nonce',
          'X-Pow-Timestamp',
        ],
      },
    });

    // Add CORS headers to gateway-level error responses (e.g. 502, 429, 403 from APIGW itself)
    // Without this, browser sees "Failed to fetch" for gateway errors (no Lambda CORS headers)
    const corsHeaders = {
      'Access-Control-Allow-Origin': "'*'",
      'Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Pow-Solution,X-Pow-Nonce,X-Pow-Timestamp'",
    };
    this.api.addGatewayResponse('GatewayResponse4xx', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: corsHeaders,
    });
    this.api.addGatewayResponse('GatewayResponse5xx', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: corsHeaders,
    });
    // Lambda reserved concurrency = 0 (kill switch) causes Lambda-level throttling.
    // API GW receives a TooManyRequestsException from the Lambda invocation API and
    // treats it as an integration failure (not its own throttle), so ResponseType.THROTTLED
    // does not fire. INTEGRATION_FAILURE is the correct type to catch this and remap to 429.
    // In normal operation (kill switch off), Lambda handles all errors via proxy responses,
    // so INTEGRATION_FAILURE only triggers during genuine Lambda infrastructure failures —
    // mapping those to 429 instead of 502 is an acceptable trade-off.
    this.api.addGatewayResponse('GatewayResponseThrottled', {
      type: apigateway.ResponseType.INTEGRATION_FAILURE,
      statusCode: '429',
      responseHeaders: corsHeaders,
    });

    // Shared LambdaIntegration instances — using allowTestInvoke: false to prevent
    // CDK from creating per-method AWS::Lambda::Permission resources. Instead, we
    // grant a single blanket invoke permission per Lambda below. This avoids hitting
    // the 20 KB Lambda resource policy size limit when many API routes exist.
    const challengeIntegration = new apigateway.LambdaIntegration(this.challengeFn, { allowTestInvoke: false });
    const healthIntegration = new apigateway.LambdaIntegration(this.healthFn, { allowTestInvoke: false });
    const authIntegration = new apigateway.LambdaIntegration(this.authFn, { allowTestInvoke: false });
    const adminAuthIntegration = new apigateway.LambdaIntegration(this.adminAuthFn, { allowTestInvoke: false });
    const adminMgmtIntegration = new apigateway.LambdaIntegration(this.adminMgmtFn, { allowTestInvoke: false });
    const vaultIntegration = new apigateway.LambdaIntegration(this.vaultFn, { allowTestInvoke: false });

    // Single blanket permission: allow API Gateway to invoke each Lambda
    for (const fn of [this.challengeFn, this.healthFn, this.authFn, this.adminAuthFn, this.adminMgmtFn, this.vaultFn]) {
      fn.addPermission(`ApiGwInvoke-${fn.node.id}`, {
        principal: new cdk.aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: this.api.arnForExecuteApi('*', '/*', '*'),
      });
    }

    // Routes — all nested under /api so CloudFront can route /api/* to API GW
    // without conflicting with SPA paths (/admin/login, /vault, etc.)
    const apiRoot = this.api.root.addResource('api');

    const challenge = apiRoot.addResource('challenge');
    challenge.addMethod('GET', challengeIntegration);

    const health = apiRoot.addResource('health');
    health.addMethod('GET', healthIntegration);

    const auth = apiRoot.addResource('auth');
    const authLogin = auth.addResource('login');
    authLogin.addMethod('POST', authIntegration);
    const authChangePassword = auth.addResource('change-password');
    authChangePassword.addMethod('POST', authIntegration);
    const authChangePasswordSelf = authChangePassword.addResource('self');
    authChangePasswordSelf.addMethod('POST', authIntegration);
    const authPasskey = auth.addResource('passkey');
    const authPasskeyChallenge = authPasskey.addResource('challenge');
    authPasskeyChallenge.addMethod('GET', authIntegration);
    const authPasskeyVerify = authPasskey.addResource('verify');
    authPasskeyVerify.addMethod('POST', authIntegration);
    const authPasskeyRegister = authPasskey.addResource('register');
    const authPasskeyRegisterChallenge = authPasskeyRegister.addResource('challenge');
    authPasskeyRegisterChallenge.addMethod('GET', authIntegration);
    authPasskeyRegister.addMethod('POST', authIntegration);
    const authPasskeys = auth.addResource('passkeys');
    authPasskeys.addMethod('GET', authIntegration);
    const authPasskeyById = authPasskeys.addResource('{credentialId}');
    authPasskeyById.addMethod('DELETE', authIntegration);
    authPasskeyById.addMethod('PATCH', authIntegration);

    const admin = apiRoot.addResource('admin');
    // Admin auth / onboarding routes → adminAuthFn
    const adminLogin = admin.addResource('login');
    adminLogin.addMethod('POST', adminAuthIntegration);
    const adminChangePassword = admin.addResource('change-password');
    adminChangePassword.addMethod('POST', adminAuthIntegration);
    const adminPasskey = admin.addResource('passkey');
    const adminPasskeyChallenge = adminPasskey.addResource('challenge');
    adminPasskeyChallenge.addMethod('GET', adminAuthIntegration);
    const adminPasskeyVerify = adminPasskey.addResource('verify');
    adminPasskeyVerify.addMethod('POST', adminAuthIntegration);
    const adminPasskeyRegister = adminPasskey.addResource('register');
    const adminPasskeyRegisterChallenge = adminPasskeyRegister.addResource('challenge');
    adminPasskeyRegisterChallenge.addMethod('GET', adminAuthIntegration);
    adminPasskeyRegister.addMethod('POST', adminAuthIntegration);
    const adminPasskeys = admin.addResource('passkeys');
    adminPasskeys.addMethod('GET', adminAuthIntegration);
    const adminPasskeyById = adminPasskeys.addResource('{credentialId}');
    adminPasskeyById.addMethod('DELETE', adminAuthIntegration);
    adminPasskeyById.addMethod('PATCH', adminAuthIntegration);

    // Admin management routes → adminMgmtFn
    const adminUsers = admin.addResource('users');
    adminUsers.addMethod('POST', adminMgmtIntegration);
    adminUsers.addMethod('GET', adminMgmtIntegration);
    const adminUserById = adminUsers.addResource('{userId}');
    adminUserById.addMethod('DELETE', adminMgmtIntegration);
    adminUserById.addMethod('PATCH', adminMgmtIntegration);
    const adminUserVault = adminUserById.addResource('vault');
    adminUserVault.addMethod('GET', adminMgmtIntegration);
    const adminUserLock = adminUserById.addResource('lock');
    adminUserLock.addMethod('POST', adminMgmtIntegration);
    const adminUserUnlock = adminUserById.addResource('unlock');
    adminUserUnlock.addMethod('POST', adminMgmtIntegration);
    const adminUserRetire = adminUserById.addResource('retire');
    adminUserRetire.addMethod('POST', adminMgmtIntegration);
    const adminUserExpire = adminUserById.addResource('expire');
    adminUserExpire.addMethod('POST', adminMgmtIntegration);
    const adminUserReactivate = adminUserById.addResource('reactivate');
    adminUserReactivate.addMethod('POST', adminMgmtIntegration);
    const adminUserRefreshOtp = adminUserById.addResource('refresh-otp');
    adminUserRefreshOtp.addMethod('POST', adminMgmtIntegration);
    const adminUserReset = adminUserById.addResource('reset');
    adminUserReset.addMethod('POST', adminMgmtIntegration);
    const adminUserEmailVault = adminUserById.addResource('email-vault');
    adminUserEmailVault.addMethod('POST', adminMgmtIntegration);
    const adminStats = admin.addResource('stats');
    adminStats.addMethod('GET', adminMgmtIntegration);
    const adminLoginEvents = admin.addResource('login-events');
    adminLoginEvents.addMethod('GET', adminMgmtIntegration);
    const adminAuditEvents = admin.addResource('audit-events');
    adminAuditEvents.addMethod('GET', adminMgmtIntegration);
    const adminAuditConfig = admin.addResource('audit-config');
    adminAuditConfig.addMethod('GET', adminMgmtIntegration);
    adminAuditConfig.addMethod('PUT', adminMgmtIntegration);

    // Admin email template management routes → adminMgmtFn
    const adminEmailTemplates = admin.addResource('email-templates');
    adminEmailTemplates.addMethod('GET', adminMgmtIntegration);
    // Static sub-resources MUST be registered before {type} so API Gateway
    // doesn't treat 'export', 'import', 'version' as path parameter values.
    const adminEmailTemplatesExport = adminEmailTemplates.addResource('export');
    adminEmailTemplatesExport.addMethod('GET', adminMgmtIntegration);
    const adminEmailTemplatesImport = adminEmailTemplates.addResource('import');
    adminEmailTemplatesImport.addMethod('POST', adminMgmtIntegration);
    const adminEmailTemplatesVersion = adminEmailTemplates.addResource('version');
    adminEmailTemplatesVersion.addMethod('GET', adminMgmtIntegration);
    const adminEmailTemplateByType = adminEmailTemplates.addResource('{type}');
    const adminEmailTemplateByTypeLang = adminEmailTemplateByType.addResource('{language}');
    adminEmailTemplateByTypeLang.addMethod('GET', adminMgmtIntegration);
    adminEmailTemplateByTypeLang.addMethod('PUT', adminMgmtIntegration);

    const authVerifyEmail = auth.addResource('verify-email');
    authVerifyEmail.addMethod('GET', authIntegration);
    const authLogout = auth.addResource('logout');
    authLogout.addMethod('POST', authIntegration);
    const authProfile = auth.addResource('profile');
    authProfile.addMethod('PATCH', authIntegration);
    const authEmailChange = auth.addResource('email-change');
    authEmailChange.addMethod('POST', authIntegration);
    const authVerifyEmailChange = auth.addResource('verify-email-change');
    authVerifyEmailChange.addMethod('POST', authIntegration);
    const authLockSelf = auth.addResource('lock-self');
    authLockSelf.addMethod('POST', authIntegration);
    const authUnsubscribe = auth.addResource('unsubscribe');
    authUnsubscribe.addMethod('POST', authIntegration);

    // Vaults — all operations unified under /api/vaults
    const vaults = apiRoot.addResource('vaults');
    vaults.addMethod('GET', vaultIntegration);
    vaults.addMethod('POST', vaultIntegration);
    // notifications must be registered before {vaultId} for API Gateway static-path precedence
    const vaultNotifications = vaults.addResource('notifications');
    vaultNotifications.addMethod('GET', vaultIntegration);
    vaultNotifications.addMethod('POST', vaultIntegration);
    const vaultById = vaults.addResource('{vaultId}');
    vaultById.addMethod('GET', vaultIntegration);
    vaultById.addMethod('PUT', vaultIntegration);
    vaultById.addMethod('PATCH', vaultIntegration);
    vaultById.addMethod('DELETE', vaultIntegration);
    const vaultIndex = vaultById.addResource('index');
    vaultIndex.addMethod('GET', vaultIntegration);
    const vaultItems = vaultById.addResource('items');
    vaultItems.addMethod('GET', vaultIntegration);
    const vaultDownload = vaultById.addResource('download');
    vaultDownload.addMethod('GET', vaultIntegration);
    const vaultEmail = vaultById.addResource('email');
    vaultEmail.addMethod('POST', vaultIntegration);

    // Config (warning codes catalog — public, no auth required)
    const configResource = apiRoot.addResource('config');
    const configWarningCodes = configResource.addResource('warning-codes');
    configWarningCodes.addMethod('GET', vaultIntegration);
  }
}

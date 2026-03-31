import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';
import type { StorageConstruct } from './storage.js';

interface BackendConstructProps {
  config: EnvironmentConfig;
  storage: StorageConstruct;
}

export class BackendConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly challengeFn: lambda.Function;
  public readonly authFn: lambda.Function;
  public readonly adminFn: lambda.Function;
  public readonly vaultFn: lambda.Function;
  public readonly healthFn: lambda.Function;
  public readonly digestFn: lambda.Function;

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
      code: lambda.Code.fromAsset('../backend/dist/challenge'),
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
      code: lambda.Code.fromAsset('../backend/dist/auth'),
      environment: commonEnv,
      memorySize: defaultMemory,
      timeout: cdk.Duration.seconds(10),
      logGroup: authLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 3 }),
    });

    // Admin Lambda
    const adminLogGroup = new logs.LogGroup(this, 'AdminLogs', {
      logGroupName: `/aws/lambda/passvault-admin-${env}`,
      retention: retentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.adminFn = new lambda.Function(this, 'AdminFn', {
      runtime,
      architecture,
      functionName: `passvault-admin-${env}`,
      handler: 'admin.handler',
      code: lambda.Code.fromAsset('../backend/dist/admin'),
      environment: commonEnv,
      memorySize: defaultMemory,
      timeout: cdk.Duration.seconds(10),
      logGroup: adminLogGroup,
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
      code: lambda.Code.fromAsset('../backend/dist/vault'),
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
      code: lambda.Code.fromAsset('../backend/dist/health'),
      environment: commonEnv,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      logGroup: healthLogGroup,
      ...(isProd && { reservedConcurrentExecutions: 2 }),
    });

    // SSM: pass parameter name (not value) to Lambdas that sign/verify tokens.
    // The Lambda fetches and decrypts the value at cold-start via the SSM API.
    this.authFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);
    this.adminFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);
    this.vaultFn.addEnvironment('JWT_SECRET_PARAM', jwtSecretParamName);

    // Passkey (WebAuthn) relying-party configuration.
    // Set these in SSM or provide via context/environment overrides at deploy time.
    // Example: PASSKEY_RP_ID=vault.example.com, PASSKEY_ORIGIN=https://vault.example.com
    if (config.features.passkeyRequired) {
      const rpId = this.node.tryGetContext('passkeyRpId') as string | undefined ?? process.env.PASSKEY_RP_ID ?? '';
      const origin = this.node.tryGetContext('passkeyOrigin') as string | undefined ?? process.env.PASSKEY_ORIGIN ?? '';
      this.authFn.addEnvironment('PASSKEY_RP_ID', rpId);
      this.authFn.addEnvironment('PASSKEY_ORIGIN', origin);
      this.adminFn.addEnvironment('PASSKEY_RP_ID', rpId);
      this.adminFn.addEnvironment('PASSKEY_ORIGIN', origin);
    }
    jwtSecretParam.grantRead(this.authFn);
    jwtSecretParam.grantRead(this.adminFn);
    jwtSecretParam.grantRead(this.vaultFn);

    // IAM: grant DynamoDB access to auth, admin, vault
    storage.usersTable.grantReadWriteData(this.authFn);
    storage.usersTable.grantReadWriteData(this.adminFn);
    storage.usersTable.grantReadWriteData(this.vaultFn);

    // IAM: login events table — auth writes, admin reads
    storage.loginEventsTable.grantWriteData(this.authFn);
    storage.loginEventsTable.grantWriteData(this.adminFn);
    storage.loginEventsTable.grantReadData(this.adminFn);

    // Pass login events table name to auth + admin Lambdas
    this.authFn.addEnvironment('LOGIN_EVENTS_TABLE_NAME', storage.loginEventsTable.tableName);
    this.adminFn.addEnvironment('LOGIN_EVENTS_TABLE_NAME', storage.loginEventsTable.tableName);

    // IAM: grant vaults table access to vault + admin Lambdas
    storage.vaultsTable.grantReadWriteData(this.vaultFn);
    storage.vaultsTable.grantReadWriteData(this.adminFn);



    // IAM: grant S3 file access to vault
    storage.filesBucket.grantReadWrite(this.vaultFn);

    // IAM: grant S3 file read+write to admin (creates empty vault on invite, downloads vault for backup)
    storage.filesBucket.grantReadWrite(this.adminFn);

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
      code: lambda.Code.fromAsset('../backend/dist/digest'),
      environment: {
        ...commonEnv,
        LOGIN_EVENTS_TABLE_NAME: storage.loginEventsTable.tableName,
      },
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      logGroup: digestLogGroup,
    });
    storage.usersTable.grantReadWriteData(this.digestFn);
    storage.loginEventsTable.grantReadData(this.digestFn);
    storage.vaultsTable.grantReadData(this.digestFn);
    storage.filesBucket.grantRead(this.digestFn);

    // EventBridge rule: run digest daily at 01:00 UTC
    new events.Rule(this, 'DigestSchedule', {
      ruleName: `passvault-digest-schedule-${env}`,
      schedule: events.Schedule.cron({ minute: '0', hour: '1' }),
      targets: [new eventsTargets.LambdaFunction(this.digestFn)],
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

    // Routes — all nested under /api so CloudFront can route /api/* to API GW
    // without conflicting with SPA paths (/admin/login, /vault, etc.)
    const apiRoot = this.api.root.addResource('api');

    const challenge = apiRoot.addResource('challenge');
    challenge.addMethod('GET', new apigateway.LambdaIntegration(this.challengeFn));

    const health = apiRoot.addResource('health');
    health.addMethod('GET', new apigateway.LambdaIntegration(this.healthFn));

    const auth = apiRoot.addResource('auth');
    const authLogin = auth.addResource('login');
    authLogin.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authChangePassword = auth.addResource('change-password');
    authChangePassword.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authPasskey = auth.addResource('passkey');
    const authPasskeyChallenge = authPasskey.addResource('challenge');
    authPasskeyChallenge.addMethod('GET', new apigateway.LambdaIntegration(this.authFn));
    const authPasskeyVerify = authPasskey.addResource('verify');
    authPasskeyVerify.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authPasskeyRegister = authPasskey.addResource('register');
    const authPasskeyRegisterChallenge = authPasskeyRegister.addResource('challenge');
    authPasskeyRegisterChallenge.addMethod('GET', new apigateway.LambdaIntegration(this.authFn));
    authPasskeyRegister.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));

    const admin = apiRoot.addResource('admin');
    const adminLogin = admin.addResource('login');
    adminLogin.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminChangePassword = admin.addResource('change-password');
    adminChangePassword.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminPasskey = admin.addResource('passkey');
    const adminPasskeyChallenge = adminPasskey.addResource('challenge');
    adminPasskeyChallenge.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));
    const adminPasskeyVerify = adminPasskey.addResource('verify');
    adminPasskeyVerify.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminPasskeyRegister = adminPasskey.addResource('register');
    const adminPasskeyRegisterChallenge = adminPasskeyRegister.addResource('challenge');
    adminPasskeyRegisterChallenge.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));
    adminPasskeyRegister.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsers = admin.addResource('users');
    adminUsers.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    adminUsers.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));
    adminUsers.addMethod('DELETE', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsersRefreshOtp = adminUsers.addResource('refresh-otp');
    adminUsersRefreshOtp.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsersLock = adminUsers.addResource('lock');
    adminUsersLock.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsersUnlock = adminUsers.addResource('unlock');
    adminUsersUnlock.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsersRetire = adminUsers.addResource('retire');
    adminUsersRetire.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsersExpire = adminUsers.addResource('expire');
    adminUsersExpire.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminVault = admin.addResource('vault');
    adminVault.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));
    const adminStats = admin.addResource('stats');
    adminStats.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));
    const adminLoginEvents = admin.addResource('login-events');
    adminLoginEvents.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));

    const authVerifyEmail = auth.addResource('verify-email');
    authVerifyEmail.addMethod('GET', new apigateway.LambdaIntegration(this.authFn));
    const authLogout = auth.addResource('logout');
    authLogout.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authProfile = auth.addResource('profile');
    authProfile.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));

    // Vaults (plural) — list and create
    const vaults = apiRoot.addResource('vaults');
    vaults.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
    vaults.addMethod('POST', new apigateway.LambdaIntegration(this.vaultFn));
    const vaultById = vaults.addResource('{vaultId}');
    vaultById.addMethod('PATCH', new apigateway.LambdaIntegration(this.vaultFn));
    vaultById.addMethod('DELETE', new apigateway.LambdaIntegration(this.vaultFn));

    // Vault (singular) — content operations on a specific vault
    const vault = apiRoot.addResource('vault');
    const vaultId = vault.addResource('{vaultId}');
    vaultId.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
    vaultId.addMethod('PUT', new apigateway.LambdaIntegration(this.vaultFn));
    const vaultDownload = vaultId.addResource('download');
    vaultDownload.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
    const vaultEmail = vaultId.addResource('email');
    vaultEmail.addMethod('POST', new apigateway.LambdaIntegration(this.vaultFn));

    // Vault notifications preferences
    const vaultNotifications = vault.addResource('notifications');
    vaultNotifications.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
    vaultNotifications.addMethod('POST', new apigateway.LambdaIntegration(this.vaultFn));

    // Config (warning codes catalog — public, no auth required)
    const configResource = apiRoot.addResource('config');
    const configWarningCodes = configResource.addResource('warning-codes');
    configWarningCodes.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
  }
}

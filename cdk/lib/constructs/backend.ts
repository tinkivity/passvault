import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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
    jwtSecretParam.grantRead(this.authFn);
    jwtSecretParam.grantRead(this.adminFn);
    jwtSecretParam.grantRead(this.vaultFn);

    // IAM: grant DynamoDB access to auth, admin, vault
    storage.usersTable.grantReadWriteData(this.authFn);
    storage.usersTable.grantReadWriteData(this.adminFn);
    storage.usersTable.grantReadWriteData(this.vaultFn);

    // IAM: grant S3 file access to vault
    storage.filesBucket.grantReadWrite(this.vaultFn);

    // IAM: grant S3 file read+write to admin (creates empty vault on invite, downloads vault for backup)
    storage.filesBucket.grantReadWrite(this.adminFn);

    // API Gateway
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `passvault-api-${env}`,
      deployOptions: {
        stageName: env,
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
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

    // Routes
    const challenge = this.api.root.addResource('challenge');
    challenge.addMethod('GET', new apigateway.LambdaIntegration(this.challengeFn));

    const health = this.api.root.addResource('health');
    health.addMethod('GET', new apigateway.LambdaIntegration(this.healthFn));

    const auth = this.api.root.addResource('auth');
    const authLogin = auth.addResource('login');
    authLogin.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authChangePassword = auth.addResource('change-password');
    authChangePassword.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authTotp = auth.addResource('totp');
    const authTotpSetup = authTotp.addResource('setup');
    authTotpSetup.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));
    const authTotpVerify = authTotp.addResource('verify');
    authTotpVerify.addMethod('POST', new apigateway.LambdaIntegration(this.authFn));

    const admin = this.api.root.addResource('admin');
    const adminLogin = admin.addResource('login');
    adminLogin.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminChangePassword = admin.addResource('change-password');
    adminChangePassword.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminTotp = admin.addResource('totp');
    const adminTotpSetup = adminTotp.addResource('setup');
    adminTotpSetup.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminTotpVerify = adminTotp.addResource('verify');
    adminTotpVerify.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    const adminUsers = admin.addResource('users');
    adminUsers.addMethod('POST', new apigateway.LambdaIntegration(this.adminFn));
    adminUsers.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));
    const adminVault = admin.addResource('vault');
    adminVault.addMethod('GET', new apigateway.LambdaIntegration(this.adminFn));

    const vault = this.api.root.addResource('vault');
    vault.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
    vault.addMethod('PUT', new apigateway.LambdaIntegration(this.vaultFn));
    const vaultDownload = vault.addResource('download');
    vaultDownload.addMethod('GET', new apigateway.LambdaIntegration(this.vaultFn));
  }
}

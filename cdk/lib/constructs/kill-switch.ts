import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as path from 'path';
import { Construct } from 'constructs';

interface KillSwitchConstructProps {
  // The application Lambda functions to throttle.
  lambdaFunctions: lambda.Function[];
  // Original reserved concurrency values matching lambdaFunctions order (e.g. [5, 3, 3, 2, 5, 2]).
  // Use 0 for functions that had no reserved concurrency (restores to unreserved pool on re-enable).
  originalConcurrency: number[];
  // SNS topic the kill switch Lambda subscribes to. Publishing an ALARM message activates the switch.
  alertTopic: sns.Topic;
  // Retention for kill switch and re-enable Lambda log groups.
  logRetentionDays: logs.RetentionDays;
  // Environment name, used in resource names.
  environment: string;
  // Minutes after kill switch fires before Lambda concurrency is auto-restored.
  reEnableMinutes: number;
  // Audit events table for recording kill switch activation/deactivation.
  auditEventsTable: dynamodb.Table;
}

export class KillSwitchConstruct extends Construct {
  public readonly killSwitchFn: lambda.Function;
  public readonly reEnableFn: lambda.Function;

  constructor(scope: Construct, id: string, props: KillSwitchConstructProps) {
    super(scope, id);

    const {
      lambdaFunctions,
      originalConcurrency,
      alertTopic,
      logRetentionDays,
      environment,
      reEnableMinutes,
    } = props;

    if (lambdaFunctions.length !== originalConcurrency.length) {
      throw new Error('lambdaFunctions and originalConcurrency must have the same length');
    }

    const functionArns = lambdaFunctions.map((fn) => fn.functionArn).join(',');
    const concurrencyLimits = originalConcurrency.join(',');
    const schedulerGroupName = `passvault-kill-switch-${environment}`;

    // -------------------------------------------------------------------------
    // EventBridge Scheduler group (holds one-time re-enable schedules)
    // -------------------------------------------------------------------------

    new scheduler.CfnScheduleGroup(this, 'SchedulerGroup', {
      name: schedulerGroupName,
    });

    // -------------------------------------------------------------------------
    // Re-enable Lambda
    // -------------------------------------------------------------------------

    const reEnableLogGroup = new logs.LogGroup(this, 'ReEnableLogs', {
      logGroupName: `/aws/lambda/passvault-kill-switch-reenable-${environment}`,
      retention: logRetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.reEnableFn = new lambda_nodejs.NodejsFunction(this, 'ReEnableFn', {
      functionName: `passvault-kill-switch-reenable-${environment}`,
      entry: path.join(__dirname, '../kill-switch-reenable-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      logGroup: reEnableLogGroup,
      environment: {
        FUNCTION_ARNS: functionArns,
        CONCURRENCY_LIMITS: concurrencyLimits,
        AUDIT_EVENTS_TABLE: props.auditEventsTable.tableName,
        ALERT_TOPIC_ARN: alertTopic.topicArn,
      },
      bundling: {
        externalModules: [],
        minify: true,
        sourceMap: false,
      },
    });

    // Re-enable Lambda: restore original concurrency (or delete reservation) on all functions
    for (const fn of lambdaFunctions) {
      this.reEnableFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['lambda:PutFunctionConcurrency', 'lambda:DeleteFunctionConcurrency'],
          resources: [fn.functionArn],
        }),
      );
    }
    props.auditEventsTable.grantWriteData(this.reEnableFn);
    alertTopic.grantPublish(this.reEnableFn);

    // -------------------------------------------------------------------------
    // IAM role for EventBridge Scheduler to invoke the re-enable Lambda
    // -------------------------------------------------------------------------

    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      roleName: `passvault-kill-switch-scheduler-${environment}`,
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    this.reEnableFn.grantInvoke(schedulerRole);

    // -------------------------------------------------------------------------
    // Kill switch Lambda
    // -------------------------------------------------------------------------

    const killSwitchLogGroup = new logs.LogGroup(this, 'KillSwitchLogs', {
      logGroupName: `/aws/lambda/passvault-kill-switch-${environment}`,
      retention: logRetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.killSwitchFn = new lambda_nodejs.NodejsFunction(this, 'KillSwitchFn', {
      functionName: `passvault-kill-switch-${environment}`,
      entry: path.join(__dirname, '../kill-switch-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      logGroup: killSwitchLogGroup,
      environment: {
        FUNCTION_ARNS: functionArns,
        REENABLE_FUNCTION_ARN: this.reEnableFn.functionArn,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        SCHEDULER_GROUP_NAME: schedulerGroupName,
        REENABLE_AFTER_MINUTES: String(reEnableMinutes),
        AUDIT_EVENTS_TABLE: props.auditEventsTable.tableName,
      },
      bundling: {
        externalModules: [],
        minify: true,
        sourceMap: false,
      },
    });

    // Kill switch Lambda: set concurrency to 0 on all functions
    for (const fn of lambdaFunctions) {
      this.killSwitchFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['lambda:PutFunctionConcurrency', 'lambda:GetFunctionConcurrency'],
          resources: [fn.functionArn],
        }),
      );
    }

    // Kill switch Lambda: create one-time EventBridge Scheduler schedules
    this.killSwitchFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule'],
        resources: [
          `arn:aws:scheduler:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:schedule/${schedulerGroupName}/*`,
        ],
      }),
    );

    // Kill switch Lambda: pass the scheduler role to EventBridge
    this.killSwitchFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerRole.roleArn],
      }),
    );

    props.auditEventsTable.grantWriteData(this.killSwitchFn);

    // -------------------------------------------------------------------------
    // Subscribe kill switch Lambda to the alert topic
    // -------------------------------------------------------------------------

    alertTopic.addSubscription(new sns_subscriptions.LambdaSubscription(this.killSwitchFn));
  }
}

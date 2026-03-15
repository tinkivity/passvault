import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '@passvault/shared';

interface MonitoringConstructProps {
  config: EnvironmentConfig;
  api: apigateway.RestApi;
  lambdaFunctions: lambda.Function[];
  usersTable: dynamodb.Table;
}

export class MonitoringConstruct extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;
  // SNS topic that receives traffic spike alarms and budget alerts.
  // The kill switch Lambda subscribes to this topic automatically.
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    const { config, api, lambdaFunctions, usersTable } = props;
    const env = config.environment;

    // -------------------------------------------------------------------------
    // SNS alert topic
    // -------------------------------------------------------------------------

    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `passvault-${env}-alerts`,
      displayName: `PassVault ${env} Alerts`,
    });

    // Allow AWS Budgets to publish to this topic
    this.alertTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowBudgetsPublish',
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.alertTopic.topicArn],
      }),
    );

    // -------------------------------------------------------------------------
    // Dashboard
    // -------------------------------------------------------------------------

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `passvault-${env}-dashboard`,
    });

    // API Gateway widgets
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Requests',
        left: [api.metricCount()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency',
        left: [
          api.metricLatency({ statistic: 'p50' }),
          api.metricLatency({ statistic: 'p99' }),
        ],
        width: 12,
      }),
    );

    // Lambda widgets
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Invocations',
        left: lambdaFunctions.map((fn) => fn.metricInvocations()),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Errors',
        left: lambdaFunctions.map((fn) => fn.metricErrors()),
        width: 12,
      }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Duration',
        left: lambdaFunctions.map((fn) => fn.metricDuration()),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Throttles',
        left: lambdaFunctions.map((fn) => fn.metricThrottles()),
        width: 12,
      }),
    );

    // DynamoDB widgets
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Read/Write Capacity',
        left: [
          usersTable.metricConsumedReadCapacityUnits(),
          usersTable.metricConsumedWriteCapacityUnits(),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Throttled Requests',
        left: [usersTable.metric('ReadThrottleEvents'), usersTable.metric('WriteThrottleEvents')],
        width: 12,
      }),
    );

    // -------------------------------------------------------------------------
    // Alarms
    // -------------------------------------------------------------------------

    // API Gateway 5xx error rate
    new cloudwatch.Alarm(this, 'ApiErrors', {
      alarmName: `passvault-${env}-api-5xx`,
      metric: api.metricServerError({ period: cdk.Duration.hours(1) }),
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Lambda error rate per function
    for (const fn of lambdaFunctions) {
      new cloudwatch.Alarm(this, `LambdaErrors-${fn.node.id}`, {
        alarmName: `passvault-${env}-lambda-errors-${fn.functionName}`,
        metric: fn.metricErrors({ period: cdk.Duration.hours(1) }),
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });
    }

    // DynamoDB throttle alarm
    new cloudwatch.Alarm(this, 'DynamoThrottle', {
      alarmName: `passvault-${env}-dynamo-throttle`,
      metric: usersTable.metric('ReadThrottleEvents', {
        period: cdk.Duration.hours(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // -------------------------------------------------------------------------
    // Sustained steady-state traffic alarm → SNS → kill switch Lambda + email
    //
    // Fires when API Gateway request rate is at or near the steady-state throttle
    // limit (10 req/s = 600 req/min) for 3 consecutive minutes. This pattern is
    // characteristic of a sustained bot attack rather than a legitimate traffic
    // burst (which is handled by the burst limit of 20 req/s and dissipates quickly).
    //
    // Threshold: 550 req/min ≈ 9.2 req/s (92% of the 10 req/s steady-state limit).
    // EvaluationPeriods: 3 consecutive 1-minute windows (= 3 minutes sustained).
    //
    // ALARM → kill switch Lambda (sets all Lambda concurrency to 0 → API GW 429).
    // OK    → email only (Lambda ignores OK state; auto-recovery via EventBridge).
    // -------------------------------------------------------------------------

    const sustainedTrafficAlarm = new cloudwatch.Alarm(this, 'SustainedTrafficAlarm', {
      alarmName: `passvault-${env}-sustained-traffic`,
      alarmDescription:
        'API Gateway sustained at steady-state throttle limit for 3 consecutive minutes — ' +
        'possible bot attack. Kill switch Lambda will set all Lambda concurrency to 0.',
      metric: api.metricCount({
        period: cdk.Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 550,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ALARM → kill switch Lambda + email
    sustainedTrafficAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alertTopic));
    // OK → email only (Lambda filters out non-ALARM states)
    sustainedTrafficAlarm.addOkAction(new cloudwatch_actions.SnsAction(this.alertTopic));

    // -------------------------------------------------------------------------
    // AWS Budget — daily cost alert ($5/day threshold)
    //
    // Sends an email via SNS when actual spend exceeds $5 in a calendar day.
    // Budget data is delayed up to 24 hours — not suitable for automated response.
    // Use the traffic spike alarm above for automated kill-switch triggering.
    //
    // Note: this is an account-wide budget. To scope to PassVault only, activate
    // the cost allocation tag 'passvault-env' in the AWS Billing console and add
    // a costFilters block to this budget.
    // -------------------------------------------------------------------------

    new budgets.CfnBudget(this, 'DailyCostBudget', {
      budget: {
        budgetName: `passvault-${env}-daily-cost`,
        budgetType: 'COST',
        timeUnit: 'DAILY',
        budgetLimit: {
          amount: 5,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100, // 100% of $5 limit
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: this.alertTopic.topicArn,
            },
          ],
        },
      ],
    });
  }
}

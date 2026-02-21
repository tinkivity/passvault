import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
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

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    const { config, api, lambdaFunctions, usersTable } = props;
    const env = config.environment;

    // Dashboard
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

    // Alarms
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
  }
}

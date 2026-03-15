import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { SNSEvent } from 'aws-lambda';

const ses = new SESClient({});
const SENDER_EMAIL = process.env.SENDER_EMAIL!;
const ALERT_EMAIL = process.env.ALERT_EMAIL!;

export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    const sns = record.Sns;
    const { subject, body } = formatMessage(sns.Message, sns.Subject);

    await ses.send(new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: { ToAddresses: [ALERT_EMAIL] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    }));
  }
}

function formatMessage(message: string, fallbackSubject?: string): { subject: string; body: string } {
  try {
    const parsed = JSON.parse(message);

    // CloudWatch alarm state change
    if (parsed.AlarmName) {
      const state: string = parsed.NewStateValue ?? 'UNKNOWN';
      const prefix = state === 'ALARM' ? '[ALARM]' : '[OK]';
      return {
        subject: `${prefix} PassVault: ${parsed.AlarmName}`,
        body: [
          `Alarm:   ${parsed.AlarmName}`,
          `State:   ${state}`,
          `Reason:  ${parsed.NewStateReason ?? '—'}`,
          `Time:    ${parsed.StateChangeTime ?? '—'}`,
          `Region:  ${parsed.Region ?? '—'}`,
          parsed.AlarmDescription ? `\n${parsed.AlarmDescription}` : '',
        ].filter(Boolean).join('\n'),
      };
    }

    // AWS Budgets notification
    if (parsed.budgetName) {
      return {
        subject: `[BUDGET] PassVault: ${parsed.budgetName}`,
        body: message,
      };
    }
  } catch {
    // non-JSON — fall through
  }

  return {
    subject: `[ALERT] PassVault: ${fallbackSubject ?? 'Notification'}`,
    body: message,
  };
}

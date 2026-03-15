import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({});

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const senderEmail = process.env.SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error('SENDER_EMAIL not configured');
  }

  await ses.send(
    new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    }),
  );
}

export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  body: string,
  attachment: { filename: string; content: string; contentType: string },
): Promise<void> {
  const senderEmail = process.env.SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error('SENDER_EMAIL not configured');
  }

  const boundary = `==PassVault_${Date.now()}==`;

  // Wrap base64 at 76 characters per line as required by MIME spec.
  const base64Content = Buffer.from(attachment.content)
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');

  const rawMessage = [
    `MIME-Version: 1.0`,
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
    ``,
    `--${boundary}`,
    `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Content,
    `--${boundary}--`,
  ].join('\r\n');

  await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
    }),
  );
}

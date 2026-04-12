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

export async function sendHtmlEmail(
  to: string,
  subject: string,
  htmlBody: string,
  plainTextBody: string,
): Promise<void> {
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
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: plainTextBody, Charset: 'UTF-8' },
        },
      },
    }),
  );
}

export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  body: string,
  attachment: { filename: string; content: string; contentType: string },
  htmlBody?: string,
): Promise<void> {
  const senderEmail = process.env.SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error('SENDER_EMAIL not configured');
  }

  const mixedBoundary = `==PassVault_Mixed_${Date.now()}==`;
  const altBoundary = `==PassVault_Alt_${Date.now()}==`;

  // Content is already base64-encoded by callers. Wrap at 76 characters per line
  // as required by MIME spec.
  const base64Content = attachment.content.replace(/(.{76})/g, '$1\r\n');

  // Build the text/html body parts
  const bodyParts: string[] = [];
  if (htmlBody) {
    // multipart/alternative with both plain text and HTML
    bodyParts.push(
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      ``,
      `--${altBoundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
      ``,
      `--${altBoundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
      ``,
      `--${altBoundary}--`,
    );
  } else {
    bodyParts.push(
      `--${mixedBoundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
    );
  }

  const rawMessage = [
    `MIME-Version: 1.0`,
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    ...bodyParts,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Content,
    `--${mixedBoundary}--`,
  ].join('\r\n');

  await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
    }),
  );
}

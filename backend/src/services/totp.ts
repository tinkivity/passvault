import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { TOTP_CONFIG } from '@passvault/shared';

authenticator.options = {
  digits: TOTP_CONFIG.DIGITS,
  period: TOTP_CONFIG.PERIOD,
  window: TOTP_CONFIG.WINDOW,
};

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function generateQrUri(username: string, secret: string): string {
  return authenticator.keyuri(username, TOTP_CONFIG.ISSUER, secret);
}

export async function generateQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

export function verifyCode(code: string, secret: string): boolean {
  return authenticator.verify({ token: code, secret });
}

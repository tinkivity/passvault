export type VaultItemCategory =
  | 'note'
  | 'login'
  | 'email'
  | 'credit_card'
  | 'identity'
  | 'wifi'
  | 'private_key';

export type WarningCode = 'duplicate_password' | 'too_simple_password';

export interface WarningCodeDefinition {
  code: WarningCode;
  label: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

interface VaultItemBase {
  id: string;            // UUID v4
  name: string;
  category: VaultItemCategory;
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  warningCodes: WarningCode[];  // stored inside encrypted vault — backend never sees this
}

export interface NoteItem extends VaultItemBase {
  category: 'note';
  format: 'raw' | 'markdown';
  text: string;
}

export interface LoginItem extends VaultItemBase {
  category: 'login';
  username: string;
  password: string;
  url?: string;
  totp?: string;
  notes?: string;
}

export interface EmailItem extends VaultItemBase {
  category: 'email';
  emailAddress: string;
  password: string;
  imapHost?: string;
  imapPort?: string;
  smtpHost?: string;
  smtpPort?: string;
  notes?: string;
}

export interface CreditCardItem extends VaultItemBase {
  category: 'credit_card';
  cardholderName: string;
  cardNumber: string;    // stored as string to preserve leading zeros
  expiryMonth: string;  // MM
  expiryYear: string;   // YYYY
  cvv: string;
  pin?: string;
  notes?: string;
}

export interface IdentityItem extends VaultItemBase {
  category: 'identity';
  firstName: string;
  lastName: string;
  dateOfBirth?: string;     // YYYY-MM-DD
  nationality?: string;
  passportNumber?: string;
  idNumber?: string;
  address?: string;
  phone?: string;
  notes?: string;
}

export interface WifiItem extends VaultItemBase {
  category: 'wifi';
  ssid: string;
  password: string;
  securityType?: string;
  notes?: string;
}

export interface PrivateKeyItem extends VaultItemBase {
  category: 'private_key';
  privateKey: string;
  publicKey?: string;
  passphrase?: string;
  keyType?: string;
  notes?: string;
}

export type VaultItem =
  | NoteItem
  | LoginItem
  | EmailItem
  | CreditCardItem
  | IdentityItem
  | WifiItem
  | PrivateKeyItem;

export interface VaultFile {
  version: 1;
  items: VaultItem[];
}

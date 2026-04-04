export type VaultItemCategory =
  | 'note'
  | 'login'
  | 'email'
  | 'credit_card'
  | 'identity'
  | 'wifi'
  | 'private_key';

export type WarningCode = 'duplicate_password' | 'too_simple_password' | 'breached_password';

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
  comment?: string;
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
}

export interface EmailItem extends VaultItemBase {
  category: 'email';
  emailAddress: string;
  password: string;
  imapHost?: string;
  imapPort?: string;
  smtpHost?: string;
  smtpPort?: string;
}

export interface CreditCardItem extends VaultItemBase {
  category: 'credit_card';
  cardholderName: string;
  cardNumber: string;    // stored as string to preserve leading zeros
  expiryMonth: string;  // MM
  expiryYear: string;   // YYYY
  cvv: string;
  pin?: string;
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
}

export interface WifiItem extends VaultItemBase {
  category: 'wifi';
  ssid: string;
  password: string;
  securityType?: string;
}

export interface PrivateKeyItem extends VaultItemBase {
  category: 'private_key';
  privateKey: string;
  publicKey?: string;
  passphrase?: string;
  keyType?: string;
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

// ── Split vault storage (v2) ────────────────────────────────────────────────

export interface VaultIndexEntry {
  id: string;
  name: string;
  category: VaultItemCategory;
  createdAt: string;
  updatedAt: string;
  warningCodes: WarningCode[];
  comment?: string;
}

export interface VaultIndexFile {
  version: 2;
  entries: VaultIndexEntry[];
}

export interface VaultItemsFile {
  version: 2;
  items: Record<string, VaultItem>;  // keyed by item ID
}

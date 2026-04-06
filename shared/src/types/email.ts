export type EmailTemplateType =
  | 'invitation'
  | 'otp-refresh'
  | 'account-reset'
  | 'email-verification'
  | 'email-change-verify'
  | 'email-change-notify'
  | 'vault-export'
  | 'vault-backup';

export interface EmailTemplateMeta {
  type: EmailTemplateType;
  language: string;
  lastModifiedAt: string;   // ISO 8601
  sizeBytes: number;
  modified: boolean;         // true if content differs from CDK-deployed original
}

export interface EmailTemplateListResponse {
  templates: EmailTemplateMeta[];
}

export interface EmailTemplateImportResult {
  imported: number;
  warnings: string[];
  errors: string[];
}

export interface EmailTemplateExportManifest {
  version: string;
  exportedAt: string;
  templates: Array<{ type: string; language: string; hash: string }>;
}

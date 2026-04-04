export type AuditCategory = 'authentication' | 'admin_actions' | 'vault_operations' | 'system';

export type AuditAction =
  // authentication
  | 'login' | 'login_failed' | 'logout'
  // admin_actions
  | 'user_created' | 'user_locked' | 'user_unlocked' | 'user_expired'
  | 'user_retired' | 'user_reset' | 'user_reactivated' | 'user_updated' | 'user_deleted'
  | 'user_otp_refreshed' | 'user_emailed_vault' | 'audit_config_changed'
  // vault_operations
  | 'vault_opened' | 'vault_saved' | 'vault_downloaded' | 'vault_imported'
  | 'vault_renamed' | 'vault_deleted' | 'vault_created'
  // system
  | 'password_changed' | 'passkey_registered' | 'passkey_revoked' | 'email_changed';

export interface AuditEvent {
  eventId: string;
  category: AuditCategory;
  action: AuditAction;
  userId: string;
  performedBy?: string;
  timestamp: string;
  details?: Record<string, string>;
  expiresAt: number;
}

export interface AuditConfig {
  authentication: boolean;
  admin_actions: boolean;
  vault_operations: boolean;
  system: boolean;
}

export interface AuditEventSummary {
  eventId: string;
  category: AuditCategory;
  action: AuditAction;
  userId: string;
  username?: string;
  performedBy?: string;
  performedByUsername?: string;
  timestamp: string;
  details?: Record<string, string>;
}

export interface AuditQueryParams {
  category?: AuditCategory;
  from?: string;
  to?: string;
  action?: AuditAction;
  userId?: string;
  limit?: number;
  nextToken?: string;
  sort?: 'asc' | 'desc';
}

export interface AuditQueryResponse {
  events: AuditEventSummary[];
  nextToken?: string;
}

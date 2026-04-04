export type AuditCategory = 'authentication' | 'admin_actions' | 'vault_operations' | 'system';

export type AuditAction =
  // authentication
  | 'login' | 'login_failed' | 'logout'
  // admin_actions
  | 'user_created' | 'user_locked' | 'user_unlocked' | 'user_expired'
  | 'user_retired' | 'user_reset' | 'user_reactivated' | 'user_updated' | 'user_deleted'
  // vault_operations
  | 'vault_created' | 'vault_deleted' | 'vault_renamed' | 'vault_saved'
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

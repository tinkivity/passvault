import type { AuditConfig } from '../types/audit.js';

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  authentication: true,
  admin_actions: false,
  vault_operations: false,
  system: false,
};

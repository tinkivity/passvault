import type { AuditConfig } from '../types/audit.js';

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  authentication: true,
  admin_actions: true,
  vault_operations: true,
  system: true,
};

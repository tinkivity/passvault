import { createContext } from '../lib/context.js';
import { adminAuthScenarios } from './01-admin-auth.js';
import { adminUserMgmtScenarios } from './02-admin-user-mgmt.js';
import { userOnboardingScenarios } from './03-user-onboarding.js';
import { vaultLifecycleScenarios } from './04-vault-lifecycle.js';
import { vaultItemsScenarios } from './05-vault-items.js';
import { userProfileScenarios } from './06-user-profile.js';
import { adminAuditScenarios } from './07-admin-audit.js';
import { emailTemplateScenarios } from './08-email-templates.js';
import { authLockoutScenarios } from './09-auth-lockout.js';
import { userAvatarScenarios } from './10-user-avatar.js';

const ctx = createContext();

// Scenarios run in order — each may depend on state set by prior ones.
// To add a new scenario: create the module, import it, call it here.
adminAuthScenarios(ctx);
adminUserMgmtScenarios(ctx);
userOnboardingScenarios(ctx);
vaultLifecycleScenarios(ctx);
vaultItemsScenarios(ctx);
userProfileScenarios(ctx);
adminAuditScenarios(ctx);
emailTemplateScenarios(ctx);
authLockoutScenarios(ctx);
userAvatarScenarios(ctx);

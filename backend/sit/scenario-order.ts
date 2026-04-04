/**
 * Defines the execution order for SIT scenarios.
 *
 * Scenarios run sequentially — each may depend on state set by prior ones.
 * To add a new scenario: create the test file, then append its filename here.
 */
export const SCENARIO_ORDER = [
  '01-admin-auth.test.ts',
  '02-admin-user-mgmt.test.ts',
  '03-user-onboarding.test.ts',
  '04-vault-lifecycle.test.ts',
  '05-vault-items.test.ts',
  '06-user-profile.test.ts',
  '07-admin-audit.test.ts',
];

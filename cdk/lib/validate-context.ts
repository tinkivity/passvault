export interface ContextInput {
  domain?: string;
  plusAddress?: string;
}

export function validatePlusAddressContext(input: ContextInput): void {
  const { domain, plusAddress } = input;
  if (plusAddress === undefined) return;

  if (!domain) {
    throw new Error('Context "plusAddress" requires "domain" to also be set. Pass --context domain=<d>.');
  }
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(plusAddress);
  if (!match) {
    throw new Error(`Context "plusAddress" must be a valid email (local@domain), got: ${plusAddress}`);
  }
  if (match[2] !== domain) {
    throw new Error(
      `Context "plusAddress" domain (${match[2]}) must match "domain" context (${domain}).`,
    );
  }
}

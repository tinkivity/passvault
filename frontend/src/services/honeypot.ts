// Honeypot: hidden field generation and timing tracking.
// The backend middleware rejects requests where hidden fields are filled
// (indicating bot activity) or where form submission is too fast.

const FIELD_NAMES = ['email_confirm', 'phone', 'website', 'fax'] as const;

export interface HoneypotState {
  fields: Record<string, string>;
  startTime: number;
}

/**
 * Create a new honeypot state for a form.
 * Call this when the form is first rendered.
 */
export function createHoneypot(): HoneypotState {
  const fields: Record<string, string> = {};
  for (const name of FIELD_NAMES) {
    fields[name] = ''; // must stay empty
  }
  return { fields, startTime: Date.now() };
}

/**
 * Get the fields to include in the POST body.
 * The honeypot fields are merged into the real payload server-side.
 */
export function getHoneypotFields(state: HoneypotState): Record<string, string> {
  return { ...state.fields };
}

/**
 * Returns elapsed milliseconds since form was created.
 */
export function getElapsedMs(state: HoneypotState): number {
  return Date.now() - state.startTime;
}

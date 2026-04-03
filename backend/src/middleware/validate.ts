import type { ZodSchema } from 'zod';
import type { Middleware } from '../utils/router.js';
import { parseBody } from '../utils/request.js';
import { error } from '../utils/response.js';

export const validate = <T>(schema: ZodSchema<T>): Middleware =>
  async (event) => {
    const parsed = parseBody(event);
    if ('parseError' in parsed) return parsed.parseError;
    const result = schema.safeParse(parsed.body);
    if (!result.success) {
      const details = Object.values(result.error.flatten().fieldErrors).flat() as string[];
      return error('Validation failed', 400, details.length > 0 ? details : undefined);
    }
    return null;
  };

import { decryptSecret } from '../../global/util/crypto.util';

/**
 * Decrypt the stored JSON credential for a generic e-commerce provider and
 * assert the required keys are present. Returns null (never throws) when the
 * credential is missing, undecryptable, or incomplete — callers treat that as
 * "not connected". Shared by the Woo/Haravan sync services (REQ-260826).
 */
export function parseProviderConfig<T extends object>(
  secretEnc: Buffer | null | undefined,
  required: (keyof T)[],
): T | null {
  if (!secretEnc) return null;
  try {
    const c = JSON.parse(decryptSecret(secretEnc)) as Partial<T>;
    for (const key of required) {
      if (!c[key]) return null;
    }
    return c as T;
  } catch {
    return null;
  }
}

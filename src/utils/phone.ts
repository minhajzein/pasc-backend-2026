import parsePhoneNumber, { type PhoneNumber } from "libphonenumber-js";

/** Default country when number is entered without country code (e.g. 7994507560 → India). */
const DEFAULT_COUNTRY = "IN";

/**
 * Parse and validate a phone number. Tries with default country (IN) first, then without.
 * Returns the parsed PhoneNumber if valid, otherwise undefined.
 */
function parseAndValidate(whatsApp: string): PhoneNumber | undefined {
  const raw = typeof whatsApp === "string" ? whatsApp.trim() : "";
  if (!raw) return undefined;
  // Try with default country first (for numbers without +country)
  let parsed = parsePhoneNumber(raw, DEFAULT_COUNTRY as "IN");
  if (!parsed && (raw.startsWith("+") || /^00\d/.test(raw.replace(/\s/g, "")))) {
    parsed = parsePhoneNumber(raw);
  }
  if (!parsed || !parsed.isValid()) return undefined;
  return parsed;
}

/**
 * Normalize phone/WhatsApp numbers to E.164 for uniqueness checks.
 * Supports all country codes. Examples:
 * - 7994507560 (IN) → "+917994507560"
 * - +1 213 373 4253 → "+12133734253"
 * - 0044 20 7946 0958 → "+442079460958"
 * Returns "" for empty or invalid input.
 */
export function normalizeWhatsAppForUniqueness(whatsApp: string): string {
  const parsed = parseAndValidate(whatsApp);
  return parsed ? parsed.number : "";
}

/**
 * Return values to use when looking up a player by WhatsApp so we match both
 * E.164 and legacy stored forms (e.g. Indian 10-digit without +91).
 */
export function whatsAppLookupValues(whatsApp: string): string[] {
  const parsed = parseAndValidate(whatsApp);
  if (!parsed) return [];
  const set = new Set<string>([parsed.number]);
  // Backward compat: match legacy records stored as national number (e.g. IN 10-digit)
  if (parsed.country === "IN") set.add(parsed.number.slice(3)); // "+917994507560" → "7994507560"
  return Array.from(set);
}

/**
 * Validate that a string is a valid phone number for any country.
 * Use this when you only need to check validity (e.g. form validation).
 */
export function isValidWhatsAppNumber(whatsApp: string): boolean {
  return parseAndValidate(whatsApp) !== undefined;
}

// src/utils/recovery.ts
// Recovery key generation utilities for forgot-password feature.
// Format: RC-xxxx-xxxx-xxxx-xxxx (segmented alphanumeric)

import crypto from "crypto";

const SEGMENT_LENGTH = 4;
const SEGMENT_COUNT = 4;
const PREFIX = "RC";
// Lowercase alphanumeric characters (no ambiguous chars: 0/o, 1/l/i)
const CHARSET = "23456789abcdefghjkmnpqrstuvwxyz";

/**
 * Generates a random segment of alphanumeric characters.
 */
function randomSegment(): string {
  let segment = "";
  const bytes = crypto.randomBytes(SEGMENT_LENGTH);
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    segment += CHARSET[bytes[i] % CHARSET.length];
  }
  return segment;
}

/**
 * Generates a recovery key in the format: RC-xxxx-xxxx-xxxx-xxxx
 * Uses cryptographically secure random bytes.
 *
 * @returns The plain-text recovery key (must be shown to user only once)
 */
export function generateRecoveryKey(): string {
  const segments: string[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    segments.push(randomSegment());
  }
  return `${PREFIX}-${segments.join("-")}`;
}

/**
 * Validates the format of a recovery key.
 * Expected: RC-xxxx-xxxx-xxxx-xxxx where x is from the allowed charset.
 */
export function isValidRecoveryKeyFormat(key: string): boolean {
  const pattern = new RegExp(
    `^${PREFIX}-[${CHARSET}]{${SEGMENT_LENGTH}}(-[${CHARSET}]{${SEGMENT_LENGTH}}){${SEGMENT_COUNT - 1}}$`
  );
  return pattern.test(key);
}

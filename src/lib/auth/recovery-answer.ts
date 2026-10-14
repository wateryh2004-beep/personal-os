import "server-only";

import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const encodedHashPattern = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{64})$/;

export function isRecoveryAnswerHash(value: string | undefined): boolean {
  return Boolean(value && encodedHashPattern.test(value));
}

export async function verifyRecoveryAnswer(first: string, second: string, encodedHash: string): Promise<boolean> {
  const match = encodedHashPattern.exec(encodedHash);
  if (!match || !/^[a-z]+$/i.test(first.trim()) || !/^[a-z]+$/i.test(second.trim())) return false;
  const normalized = `${first.trim().toLowerCase()}\n${second.trim().toLowerCase()}`;
  const actual = await deriveKey(normalized, Buffer.from(match[1], "hex"), 32) as Buffer;
  return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}

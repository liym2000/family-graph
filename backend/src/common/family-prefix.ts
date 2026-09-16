import { randomInt } from 'node:crypto';

const PREFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomFamilyPrefix() {
  return Array.from({ length: 6 }, () => PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)]).join(
    '',
  );
}

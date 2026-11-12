import "server-only";
import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A short, unguessable link code: 8 characters from 56 that can't be
 * misread (no 0/O, 1/l/I). About 10^14 codes, so a client link can't be
 * found by guessing, yet "360.studioskape.in/s/Kd7mQ2xa" fits in a message.
 */
export function shortToken(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

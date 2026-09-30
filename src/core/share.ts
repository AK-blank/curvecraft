/**
 * Shareable launch specs.
 *
 * A spec is small enough to live in a URL, which is what turns the studio into a
 * marketplace: every design has a link, and a link can be forked.
 */
import type { LaunchSpec } from './types';

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSpec(spec: LaunchSpec): string {
  return toBase64Url(JSON.stringify(spec));
}

export function decodeSpec(encoded: string): LaunchSpec | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as LaunchSpec;
    if (!parsed || typeof parsed !== 'object' || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Absolute-ish studio link for a spec. */
export function specLink(spec: LaunchSpec, base = '/studio'): string {
  return `${base}?s=${encodeSpec(spec)}`;
}

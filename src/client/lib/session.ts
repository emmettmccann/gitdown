/**
 * Client-side identity (SPEC 8).
 *
 * This is not authentication and must not be described as such. It is a
 * self-issued name plus a secret that proves the *same browser* issued it, so
 * that one visitor cannot post under another visitor's established name. That
 * is the actual threat on an unauthenticated comment box.
 *
 *   - `id` is public. It becomes the comment's `actor` and appears in the feed.
 *   - `token` is secret. It goes out only in a request body over TLS, is never
 *     rendered, and the server keeps only its SHA-256.
 */
import { useSyncExternalStore } from "react";

const KEY = { id: "gd.session.id", token: "gd.session.token", name: "gd.session.name" } as const;

export interface Session {
  id: string;
  token: string;
  displayName: string;
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * localStorage can throw outright — Safari in private mode, or a browser with
 * site data blocked. A visitor who cannot persist a session should still get a
 * working composer, so this degrades to an in-memory session that lasts the
 * page load rather than breaking the page.
 */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* memory-only session; nothing to do about it and nothing worth saying. */
  }
}

let cached: Session | null = null;

/**
 * The session is a store, not a value: renaming yourself has to repaint the
 * composer's "Commenting as …" line, and the store is what tells React that.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): Session {
  if (cached) return cached;

  const id = readStored(KEY.id) ?? crypto.randomUUID();
  // 32 hex chars of CSPRNG. The only thing standing between a session id —
  // which is public and appears in every response — and posting as it.
  const token = readStored(KEY.token) ?? randomHex(16);
  const displayName = readStored(KEY.name) ?? `visitor-${id.slice(0, 4)}`;

  writeStored(KEY.id, id);
  writeStored(KEY.token, token);
  writeStored(KEY.name, displayName);

  cached = { id, token, displayName };
  return cached;
}

export function setDisplayName(displayName: string): void {
  writeStored(KEY.name, displayName);
  // Replaced rather than mutated: `useSyncExternalStore` compares snapshots by
  // identity, and an in-place edit would leave every subscriber on the old
  // name.
  cached = { ...getSession(), displayName };
  for (const listener of listeners) listener();
}

/**
 * Who you are posting as, as a hook.
 *
 * `getSession` is the snapshot on both sides because there is no server render
 * to disagree with — the shell ships empty and React mounts into it.
 */
export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

/** How many filler avatar colours the stylesheet defines. */
const AVATAR_COLOURS = 7;

/**
 * A stable colour per author, derived from the id alone — the parody stand-in
 * for an identicon (SPEC 8). Drawn from the id rather than fetched, so there is
 * no external request and no Gravatar.
 */
export function avatarClass(actor: string): string {
  let hash = 0;
  for (let i = 0; i < actor.length; i += 1) {
    hash = (hash * 31 + actor.charCodeAt(i)) | 0;
  }
  return `avatar-c${(Math.abs(hash) % AVATAR_COLOURS) + 1}`;
}

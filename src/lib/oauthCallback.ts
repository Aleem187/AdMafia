import { completeOAuthCallback, type OAuthCallbackResult } from './api';

/**
 * Early OAuth callback exchange.
 *
 * When a platform redirects back to /app/connections?code=...&state=..., the
 * normal flow waits for AuthProvider's `supabase.auth.getSession()` to resolve
 * before ProtectedRoute even mounts ConnectionsPage. That adds hundreds of ms
 * (sometimes seconds) before the code is exchanged, and some providers expire
 * codes quickly.
 *
 * This module reads the persisted Supabase session straight out of
 * localStorage (synchronously) and kicks off `completeOAuthCallback` from
 * app startup (see main.tsx). ConnectionsPage then picks up the in-flight
 * promise via `getPendingOAuthCallback` instead of starting a new request.
 */

export interface StoredSession {
  accessToken: string;
  userId: string;
}

export interface PendingOAuthCallback {
  code: string;
  promise: Promise<OAuthCallbackResult>;
}

// Skip the token if it expires within this window; the fallback path will
// go through getSession(), which refreshes it.
const EXPIRY_MARGIN_SECONDS = 30;

function supabaseStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    // Mirrors supabase-js v2: `sb-${hostname.split('.')[0]}-auth-token`
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

function parseStoredSession(raw: string): StoredSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  // v2 stores the Session object directly; older builds wrapped it in
  // `{ currentSession }`. Support both.
  const obj = parsed as Record<string, unknown>;
  const session = (obj.currentSession ?? obj) as Record<string, unknown>;

  const accessToken = session.access_token;
  const user = session.user as Record<string, unknown> | undefined;
  const userId = user?.id;
  if (typeof accessToken !== 'string' || typeof userId !== 'string') return null;

  const expiresAt = session.expires_at;
  if (typeof expiresAt === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt - EXPIRY_MARGIN_SECONDS <= now) return null;
  }

  return { accessToken, userId };
}

/**
 * Synchronously read the persisted Supabase session from localStorage.
 * Returns null when there is no session, it can't be parsed, or the access
 * token is expired / about to expire.
 */
export function getStoredSessionSync(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return null;
  }

  const candidates: string[] = [];
  const primary = supabaseStorageKey();
  if (primary) candidates.push(primary);
  // Fallback: scan for any supabase v2 auth key (custom domains, etc.).
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key) && !candidates.includes(key)) {
        candidates.push(key);
      }
    }
  } catch {
    /* ignore */
  }

  for (const key of candidates) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;
    const session = parseStoredSession(raw);
    if (session) return session;
  }
  return null;
}

let pending: PendingOAuthCallback | null = null;

/**
 * Call once at app startup. If the current URL is the OAuth redirect target
 * with `code` and `state`, and a usable session exists in localStorage, start
 * the code exchange immediately without waiting for React or Supabase auth
 * initialisation.
 */
export function startEarlyOAuthCallback(): PendingOAuthCallback | null {
  if (pending) return pending;
  if (typeof window === 'undefined') return null;

  const { pathname, search } = window.location;
  if (pathname.replace(/\/+$/, '') !== '/app/connections') return null;

  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;

  const stored = getStoredSessionSync();
  if (!stored) return null;

  // Platform is deliberately omitted: oauth-connect records state -> platform
  // in oauth_verifiers for every platform, and the server resolves it from
  // `state` alone. Guessing a platform here would risk sending, say, Google's
  // authorization code to TikTok's token endpoint.
  const promise = completeOAuthCallback(
    { code, state, userId: stored.userId },
    stored.accessToken
  );
  // Avoid an "unhandled rejection" if the page never consumes the result;
  // the page attaches its own handlers.
  promise.catch(() => {});

  pending = { code, promise };
  return pending;
}

/** Return the in-flight (or settled) early exchange for this code, if any. */
export function getPendingOAuthCallback(code: string): PendingOAuthCallback | null {
  return pending && pending.code === code ? pending : null;
}

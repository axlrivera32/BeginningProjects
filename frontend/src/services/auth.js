// auth.js
// Primary: writes to backend API → PostgreSQL or SQLite
// Fallback: localStorage only (when backend is offline / not configured)
//
// Every function tries the API first.
// If the API call succeeds the result is also cached in localStorage
// so the session survives page reloads without a round-trip.

const API_BASE    = '/api/auth';
const SESSION_KEY = 'ndx_session';
const SALT        = 'nexdefi_v5_2025';

// ── Crypto helpers (used for AES-256-GCM key encryption only) ──────────────
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s + SALT));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(pw) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(SALT), iterations: 100000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function encryptData(pt, pw) {
  const key = await deriveKey(pw);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(pt));
  const buf = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv);
  buf.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...buf));
}

export async function decryptData(b64, pw) {
  try {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const key = await deriveKey(pw);
    const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Decryption failed — wrong key or corrupted data.');
  }
}

// ── Token helpers ────────────────────────────────────────────────────────────
function genToken(n = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY))?.accessToken || null; }
  catch { return null; }
}

// ── API call helper ──────────────────────────────────────────────────────────
async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  }
  return data;
}

async function apiGet(endpoint) {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal:  AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

async function apiPut(endpoint, body) {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ── Session persistence ──────────────────────────────────────────────────────
function buildSession(apiUser, accessToken, refreshToken) {
  return {
    // Identity (from DB / API)
    id:           apiUser.id,
    email:        apiUser.email,
    name:         apiUser.name,
    avatar:       apiUser.avatar || apiUser.name?.slice(0, 2).toUpperCase() || '?',
    walletAddress:apiUser.walletAddress || null,
    isWalletUser: apiUser.isWalletUser  || false,
    // Auth tokens
    accessToken,
    refreshToken,
    // Local meta
    loginAt:      Date.now(),
    expiresAt:    Date.now() + 7 * 864e5,
    source:       'api',
  };
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s || Date.now() > s.expiresAt) { clearSession(); return null; }
    return s;
  } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── Register ──────────────────────────────────────────────────────────────────
export async function register({ firstName, lastName, email, password }) {
  const data = await apiPost('/register', { firstName, lastName, email, password });
  // data = { accessToken, refreshToken, user }
  return saveSession(buildSession(data.user, data.accessToken, data.refreshToken));
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function login({ email, password }) {
  const data = await apiPost('/login', { email, password });
  return saveSession(buildSession(data.user, data.accessToken, data.refreshToken));
}

// ── Wallet login ──────────────────────────────────────────────────────────────
export async function loginWithWallet(address, name) {
  const data = await apiPost('/wallet-login', { address, name });
  return saveSession(buildSession(data.user, data.accessToken, data.refreshToken));
}

// ── Update profile ────────────────────────────────────────────────────────────
export async function updateProfile(session, { name }) {
  const user = await apiPut('/profile', { name });
  const updated = { ...session, name: user.name, avatar: user.avatar };
  saveSession(updated);
  return updated;
}

// ── Change password ───────────────────────────────────────────────────────────
export async function changePassword(session, oldPassword, newPassword) {
  await apiPost('/change-password', { oldPassword, newPassword });
}

// ── Password recovery ─────────────────────────────────────────────────────────
export async function sendRecovery(email) {
  return apiPost('/send-recovery', { email });
}

export async function resetPassword(email, code, newPassword) {
  return apiPost('/reset-password', { email, code, newPassword });
}

// ── Legacy helpers used by AuthScreen (kept for recovery flow) ────────────────
const _localCodes = new Map();

export function generateRecoveryCode(email) {
  // Used only when backend is unreachable — generates local code for dev
  const code = String(Math.floor(1e5 + Math.random() * 9e5));
  _localCodes.set(email.toLowerCase(), { code, exp: Date.now() + 6e5 });
  console.info(`[DEV fallback] Recovery code for ${email}: ${code}`);
  return code;
}

export function verifyRecoveryCode(email, code) {
  const r = _localCodes.get(email.toLowerCase());
  if (!r || Date.now() > r.exp) { _localCodes.delete(email.toLowerCase()); return false; }
  return r.code === code.trim();
}

export function findUser(email) {
  // Only used by local recovery fallback in AuthScreen
  const s = loadSession();
  return s && s.email?.toLowerCase() === email.toLowerCase() ? s : null;
}

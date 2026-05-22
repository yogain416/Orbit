// Google access/refresh token 보관 + 만료 임박 시 자동 재발급.
// Plan 4 Task 1 — Supabase OAuth 후 session.provider_token / provider_refresh_token을
// secure-storage에 저장하고, Plan 4 google-calendar/google-tasks가 호출 직전에 가져다 씀.

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const KEY_ACCESS = 'google_access_token'
const KEY_REFRESH = 'google_refresh_token'
const KEY_EXPIRES_AT = 'google_token_expires_at'

const DEFAULT_LIFETIME_MS = 55 * 60 * 1000
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000

export function createGoogleTokens({
  storage,
  fetchFn = (typeof fetch !== 'undefined' ? fetch : null),
  now = Date.now,
  clientId,
  clientSecret
}) {
  if (!storage) throw new Error('createGoogleTokens: storage is required')

  function saveFromSession(session) {
    if (!session) return
    const access = session.provider_token
    if (!access) return
    storage.setItem(KEY_ACCESS, access)
    storage.setItem(KEY_EXPIRES_AT, String(now() + DEFAULT_LIFETIME_MS))
    if (session.provider_refresh_token) {
      storage.setItem(KEY_REFRESH, session.provider_refresh_token)
    }
  }

  function hasRefreshToken() {
    return storage.getItem(KEY_REFRESH) != null
  }

  async function refresh() {
    const refreshToken = storage.getItem(KEY_REFRESH)
    if (!refreshToken) throw new Error('refresh_token이 저장되어 있지 않습니다')
    if (!fetchFn) throw new Error('fetchFn is required')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: String(clientId || ''),
      client_secret: String(clientSecret || '')
    }).toString()

    const res = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) {
      const text = typeof res.text === 'function' ? await res.text() : ''
      throw new Error(`Google token refresh failed (${res.status}): ${text}`)
    }
    const payload = await res.json()
    if (!payload || !payload.access_token) {
      throw new Error('Google token response missing access_token')
    }
    storage.setItem(KEY_ACCESS, payload.access_token)
    const lifetimeMs = (Number(payload.expires_in) || DEFAULT_LIFETIME_MS / 1000) * 1000
    storage.setItem(KEY_EXPIRES_AT, String(now() + lifetimeMs))
    if (payload.refresh_token) {
      storage.setItem(KEY_REFRESH, payload.refresh_token)
    }
    return payload.access_token
  }

  async function getAccessToken() {
    const access = storage.getItem(KEY_ACCESS)
    if (!access) return null
    const expiresAt = Number(storage.getItem(KEY_EXPIRES_AT) || 0)
    if (expiresAt - now() > REFRESH_THRESHOLD_MS) return access
    if (!hasRefreshToken()) return null
    return await refresh()
  }

  function clear() {
    storage.removeItem(KEY_ACCESS)
    storage.removeItem(KEY_REFRESH)
    storage.removeItem(KEY_EXPIRES_AT)
  }

  return {
    saveFromSession,
    getAccessToken,
    refresh,
    clear,
    hasRefreshToken
  }
}

let _instance = null

export function getGoogleTokens({ storage, clientId, clientSecret } = {}) {
  if (_instance) return _instance
  _instance = createGoogleTokens({ storage, clientId, clientSecret })
  return _instance
}

export function __resetGoogleTokensForTest() {
  _instance = null
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGoogleTokens, GOOGLE_TOKEN_ENDPOINT } from './google-tokens.js'

function makeMemoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    __map: map
  }
}

function makeTokens(overrides = {}) {
  const storage = overrides.storage || makeMemoryStorage()
  const fetchFn = overrides.fetchFn || vi.fn()
  const now = overrides.now || (() => 1_700_000_000_000)
  const tokens = createGoogleTokens({
    storage,
    fetchFn,
    now,
    clientId: overrides.clientId ?? 'cid',
    clientSecret: overrides.clientSecret ?? 'csec'
  })
  return { tokens, storage, fetchFn, now }
}

describe('saveFromSession', () => {
  it('provider_token + provider_refresh_token을 secure-storage에 저장', () => {
    const { tokens, storage } = makeTokens()
    tokens.saveFromSession({
      provider_token: 'ya29.access',
      provider_refresh_token: '1//refresh',
      expires_at: 9999
    })
    expect(storage.getItem('google_access_token')).toBe('ya29.access')
    expect(storage.getItem('google_refresh_token')).toBe('1//refresh')
  })

  it('expires_at을 ms 단위로 저장 (현재 시각 + ~55분 기본)', () => {
    const now = () => 1_700_000_000_000
    const { tokens, storage } = makeTokens({ now })
    tokens.saveFromSession({ provider_token: 'a', provider_refresh_token: 'r' })
    const stored = Number(storage.getItem('google_token_expires_at'))
    expect(stored).toBeGreaterThan(now())
    expect(stored).toBeLessThanOrEqual(now() + 60 * 60 * 1000)
    expect(stored).toBeGreaterThanOrEqual(now() + 50 * 60 * 1000)
  })

  it('provider_token 없으면 no-op (이메일 로그인 등)', () => {
    const { tokens, storage } = makeTokens()
    tokens.saveFromSession({ provider_token: null })
    expect(storage.getItem('google_access_token')).toBeNull()
  })

  it('새 session에 provider_refresh_token이 없으면 기존 refresh token 유지', () => {
    const { tokens, storage } = makeTokens()
    tokens.saveFromSession({ provider_token: 'a1', provider_refresh_token: 'r_old' })
    tokens.saveFromSession({ provider_token: 'a2' /* no refresh */ })
    expect(storage.getItem('google_access_token')).toBe('a2')
    expect(storage.getItem('google_refresh_token')).toBe('r_old')
  })

  it('null/undefined session 입력에 안전', () => {
    const { tokens } = makeTokens()
    expect(() => tokens.saveFromSession(null)).not.toThrow()
    expect(() => tokens.saveFromSession(undefined)).not.toThrow()
  })
})

describe('getAccessToken', () => {
  it('저장된 token이 없으면 null', async () => {
    const { tokens } = makeTokens()
    expect(await tokens.getAccessToken()).toBeNull()
  })

  it('만료 5분 이상 남았으면 그대로 반환 (refresh 호출 안 함)', async () => {
    const now = () => 1_700_000_000_000
    const { tokens, storage, fetchFn } = makeTokens({ now })
    storage.setItem('google_access_token', 'still_good')
    storage.setItem('google_refresh_token', 'r1')
    storage.setItem('google_token_expires_at', String(now() + 30 * 60 * 1000))
    expect(await tokens.getAccessToken()).toBe('still_good')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('만료 5분 이내면 refresh 호출 후 새 token 반환', async () => {
    const now = () => 1_700_000_000_000
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new_token', expires_in: 3600 })
    })
    const { tokens, storage } = makeTokens({ now, fetchFn })
    storage.setItem('google_access_token', 'old_token')
    storage.setItem('google_refresh_token', 'r1')
    storage.setItem('google_token_expires_at', String(now() + 60 * 1000)) // 1분 남음
    expect(await tokens.getAccessToken()).toBe('new_token')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(storage.getItem('google_access_token')).toBe('new_token')
  })

  it('refresh_token이 없고 access_token이 만료됐으면 null', async () => {
    const now = () => 1_700_000_000_000
    const { tokens, storage } = makeTokens({ now })
    storage.setItem('google_access_token', 'expired')
    storage.setItem('google_token_expires_at', String(now() - 1000))
    expect(await tokens.getAccessToken()).toBeNull()
  })
})

describe('refresh', () => {
  it('Google token endpoint에 refresh_token grant로 POST', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'a_new', expires_in: 3600 })
    })
    const { tokens, storage } = makeTokens({ fetchFn })
    storage.setItem('google_refresh_token', 'r1')
    await tokens.refresh()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchFn.mock.calls[0]
    expect(url).toBe(GOOGLE_TOKEN_ENDPOINT)
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(opts.body).toContain('grant_type=refresh_token')
    expect(opts.body).toContain('refresh_token=r1')
    expect(opts.body).toContain('client_id=cid')
    expect(opts.body).toContain('client_secret=csec')
  })

  it('성공 시 access_token + expires_at 업데이트', async () => {
    const now = () => 1_700_000_000_000
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'a_new', expires_in: 3600 })
    })
    const { tokens, storage } = makeTokens({ now, fetchFn })
    storage.setItem('google_refresh_token', 'r1')
    await tokens.refresh()
    expect(storage.getItem('google_access_token')).toBe('a_new')
    const exp = Number(storage.getItem('google_token_expires_at'))
    expect(exp).toBe(now() + 3600 * 1000)
  })

  it('refresh_token이 없으면 throw', async () => {
    const { tokens } = makeTokens()
    await expect(tokens.refresh()).rejects.toThrow(/refresh_token/)
  })

  it('Google API 4xx 응답이면 throw', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}'
    })
    const { tokens, storage } = makeTokens({ fetchFn })
    storage.setItem('google_refresh_token', 'r1')
    await expect(tokens.refresh()).rejects.toThrow(/400|invalid_grant/)
  })

  it('응답에 access_token이 없으면 throw', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ /* missing access_token */ })
    })
    const { tokens, storage } = makeTokens({ fetchFn })
    storage.setItem('google_refresh_token', 'r1')
    await expect(tokens.refresh()).rejects.toThrow(/access_token/)
  })

  it('Google이 새 refresh_token을 함께 주면 그것도 업데이트', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'a_new', refresh_token: 'r_new', expires_in: 3600 })
    })
    const { tokens, storage } = makeTokens({ fetchFn })
    storage.setItem('google_refresh_token', 'r1')
    await tokens.refresh()
    expect(storage.getItem('google_refresh_token')).toBe('r_new')
  })
})

describe('clear', () => {
  it('모든 google_* 키를 제거', () => {
    const { tokens, storage } = makeTokens()
    storage.setItem('google_access_token', 'a')
    storage.setItem('google_refresh_token', 'r')
    storage.setItem('google_token_expires_at', '123')
    tokens.clear()
    expect(storage.getItem('google_access_token')).toBeNull()
    expect(storage.getItem('google_refresh_token')).toBeNull()
    expect(storage.getItem('google_token_expires_at')).toBeNull()
  })

  it('저장된 게 없어도 throw 안 함', () => {
    const { tokens } = makeTokens()
    expect(() => tokens.clear()).not.toThrow()
  })
})

describe('hasRefreshToken', () => {
  it('refresh token 있으면 true', () => {
    const { tokens, storage } = makeTokens()
    storage.setItem('google_refresh_token', 'r')
    expect(tokens.hasRefreshToken()).toBe(true)
  })

  it('없으면 false', () => {
    const { tokens } = makeTokens()
    expect(tokens.hasRefreshToken()).toBe(false)
  })
})

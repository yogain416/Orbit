import { describe, it, expect, vi, beforeEach } from 'vitest'

const createClientMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => {
    createClientMock(...args)
    return { __fake: true }
  }
}))

// supabase.js는 모듈 평가 시점에 config.js를 import하는데, config.js는 electron app을 import.
// vitest 환경에서 electron의 동작은 안전하므로 그대로 import.
import { createSupabaseClient } from './supabase.js'

beforeEach(() => {
  createClientMock.mockClear()
})

describe('createSupabaseClient', () => {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

  it('url, anonKey가 그대로 createClient에 전달된다', () => {
    createSupabaseClient({ url: 'https://x.supabase.co', anonKey: 'KEY', storage })
    expect(createClientMock).toHaveBeenCalledTimes(1)
    const [url, key] = createClientMock.mock.calls[0]
    expect(url).toBe('https://x.supabase.co')
    expect(key).toBe('KEY')
  })

  it('주입된 storage 어댑터가 auth options에 들어간다', () => {
    createSupabaseClient({ url: 'http://x', anonKey: 'k', storage })
    const opts = createClientMock.mock.calls[0][2]
    expect(opts.auth.storage).toBe(storage)
  })

  it('PKCE flow로 설정된다 (Electron 환경에 적합)', () => {
    createSupabaseClient({ url: 'http://x', anonKey: 'k', storage })
    expect(createClientMock.mock.calls[0][2].auth.flowType).toBe('pkce')
  })

  it('autoRefreshToken + persistSession 활성화', () => {
    createSupabaseClient({ url: 'http://x', anonKey: 'k', storage })
    const auth = createClientMock.mock.calls[0][2].auth
    expect(auth.autoRefreshToken).toBe(true)
    expect(auth.persistSession).toBe(true)
  })

  it('detectSessionInUrl=false — Electron deep link로 직접 처리하므로 비활성화', () => {
    createSupabaseClient({ url: 'http://x', anonKey: 'k', storage })
    expect(createClientMock.mock.calls[0][2].auth.detectSessionInUrl).toBe(false)
  })
})

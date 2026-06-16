import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuth, REDIRECT_URL, GOOGLE_SCOPES } from './auth.js'

function makeFakeClient(overrides = {}) {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
        error: null
      }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'at', provider_token: 'gpt', provider_refresh_token: 'grt', user: { id: 'u1', email: 'a@b.com' } } },
        error: null
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'at', user: { id: 'u1' } } },
        error: null
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      ...overrides.auth
    }
  }
}

function makeAuth({ client, openExternal = vi.fn().mockResolvedValue(undefined), tokenStore } = {}) {
  const c = client || makeFakeClient()
  const auth = createAuth({ getClient: () => c, openExternal, tokenStore })
  return { auth, client: c, openExternal, tokenStore }
}

function makeFakeTokenStore() {
  return {
    saveFromSession: vi.fn(),
    clear: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null)
  }
}

describe('signInWithGoogle', () => {
  it('signInWithOAuth를 google provider + REDIRECT_URL로 호출', async () => {
    const { auth, client } = makeAuth()
    await auth.signInWithGoogle()
    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1)
    const args = client.auth.signInWithOAuth.mock.calls[0][0]
    expect(args.provider).toBe('google')
    expect(args.options.redirectTo).toBe(REDIRECT_URL)
  })

  it('Google Calendar/Tasks scope를 요청', async () => {
    const { auth, client } = makeAuth()
    await auth.signInWithGoogle()
    const opts = client.auth.signInWithOAuth.mock.calls[0][0].options
    expect(opts.scopes).toBe(GOOGLE_SCOPES)
    expect(opts.scopes).toContain('calendar')
    expect(opts.scopes).toContain('tasks')
  })

  it('refresh token을 받기 위해 access_type=offline + prompt=consent', async () => {
    const { auth, client } = makeAuth()
    await auth.signInWithGoogle()
    const qp = client.auth.signInWithOAuth.mock.calls[0][0].options.queryParams
    expect(qp.access_type).toBe('offline')
    expect(qp.prompt).toBe('consent')
  })

  it('skipBrowserRedirect=true로 SDK가 main process에서 redirect를 시도하지 않게 함', async () => {
    const { auth, client } = makeAuth()
    await auth.signInWithGoogle()
    expect(client.auth.signInWithOAuth.mock.calls[0][0].options.skipBrowserRedirect).toBe(true)
  })

  it('받은 URL을 openExternal로 전달 (외부 브라우저 사용)', async () => {
    const { auth, openExternal } = makeAuth()
    await auth.signInWithGoogle()
    expect(openExternal).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?...')
  })

  it('Supabase error 시 throw', async () => {
    const client = makeFakeClient({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: new Error('boom') })
      }
    })
    const { auth } = makeAuth({ client })
    await expect(auth.signInWithGoogle()).rejects.toThrow('boom')
  })

  it('URL이 없으면 throw', async () => {
    const client = makeFakeClient({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null })
      }
    })
    const { auth } = makeAuth({ client })
    await expect(auth.signInWithGoogle()).rejects.toThrow(/url/i)
  })
})

describe('handleAuthCallback', () => {
  it('callback URL에서 code 추출 → exchangeCodeForSession 호출', async () => {
    const { auth, client } = makeAuth()
    const result = await auth.handleAuthCallback('app://orbit/auth/callback?code=AUTHCODE123')
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('AUTHCODE123')
    expect(result.session.user.id).toBe('u1')
  })

  it('code 없으면 throw', async () => {
    const { auth } = makeAuth()
    await expect(auth.handleAuthCallback('app://orbit/auth/callback')).rejects.toThrow(/code/i)
  })

  it('OAuth error 파라미터가 오면 메시지를 throw', async () => {
    const { auth } = makeAuth()
    await expect(
      auth.handleAuthCallback('app://orbit/auth/callback?error=access_denied&error_description=User%20denied')
    ).rejects.toThrow(/User denied|access_denied/)
  })

  it('exchangeCodeForSession error 시 throw', async () => {
    const client = makeFakeClient({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: null, error: new Error('exchange failed') })
      }
    })
    const { auth } = makeAuth({ client })
    await expect(auth.handleAuthCallback('app://x?code=c')).rejects.toThrow('exchange failed')
  })

  it('tokenStore가 주입되어 있으면 session을 tokenStore.saveFromSession에 넘김 (Plan 4)', async () => {
    const tokenStore = makeFakeTokenStore()
    const { auth } = makeAuth({ tokenStore })
    await auth.handleAuthCallback('app://orbit/auth/callback?code=c')
    expect(tokenStore.saveFromSession).toHaveBeenCalledTimes(1)
    const session = tokenStore.saveFromSession.mock.calls[0][0]
    expect(session.provider_token).toBe('gpt')
    expect(session.provider_refresh_token).toBe('grt')
  })

  it('tokenStore.saveFromSession이 throw해도 로그인 결과 자체는 정상 반환', async () => {
    const tokenStore = {
      saveFromSession: vi.fn(() => { throw new Error('storage write failed') })
    }
    const { auth } = makeAuth({ tokenStore })
    const result = await auth.handleAuthCallback('app://orbit/auth/callback?code=c')
    expect(result.session.user.id).toBe('u1')
  })

  it('tokenStore 미주입 시 정상 동작 (이전 동작 유지)', async () => {
    const { auth } = makeAuth() // tokenStore 없음
    const result = await auth.handleAuthCallback('app://orbit/auth/callback?code=c')
    expect(result.session.user.id).toBe('u1')
  })
})

describe('getSession / getUser', () => {
  it('getSession은 client의 session을 반환', async () => {
    const { auth } = makeAuth()
    const s = await auth.getSession()
    expect(s.access_token).toBe('at')
  })

  it('getUser는 session.user를 반환', async () => {
    const { auth } = makeAuth()
    const u = await auth.getUser()
    expect(u.id).toBe('u1')
  })

  it('session이 null이면 getUser는 null', async () => {
    const client = makeFakeClient({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
      }
    })
    const { auth } = makeAuth({ client })
    expect(await auth.getUser()).toBeNull()
  })

  it('getSession error 시 throw', async () => {
    const client = makeFakeClient({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: null, error: new Error('session fail') })
      }
    })
    const { auth } = makeAuth({ client })
    await expect(auth.getSession()).rejects.toThrow('session fail')
  })
})

describe('signOut', () => {
  it('client.auth.signOut을 호출', async () => {
    const { auth, client } = makeAuth()
    await auth.signOut()
    expect(client.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('error 시 throw', async () => {
    const client = makeFakeClient({
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: new Error('signout fail') })
      }
    })
    const { auth } = makeAuth({ client })
    await expect(auth.signOut()).rejects.toThrow('signout fail')
  })

  it('tokenStore가 있으면 signOut 후 tokenStore.clear 호출 (Plan 4)', async () => {
    const tokenStore = makeFakeTokenStore()
    const { auth } = makeAuth({ tokenStore })
    await auth.signOut()
    expect(tokenStore.clear).toHaveBeenCalledTimes(1)
  })

  it('signOut이 실패하면 tokenStore.clear는 호출되지 않음 (세션 유지)', async () => {
    const tokenStore = makeFakeTokenStore()
    const client = makeFakeClient({
      auth: { signOut: vi.fn().mockResolvedValue({ error: new Error('signout fail') }) }
    })
    const { auth } = makeAuth({ client, tokenStore })
    await expect(auth.signOut()).rejects.toThrow('signout fail')
    expect(tokenStore.clear).not.toHaveBeenCalled()
  })
})

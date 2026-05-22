import { shell } from 'electron'
import { getSupabaseClient } from './supabase.js'
import { getSecureStorage } from './secure-storage.js'
import { createGoogleTokens } from './google-tokens.js'
import { config } from './config.js'

// Google OAuth scopes — email/profile은 Supabase profiles 생성용,
// calendar/tasks는 Plan 4의 Google sync에서 직접 호출하기 위해 미리 받아둠.
export const GOOGLE_SCOPES =
  'email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks'

// Supabase 콘솔의 Authentication → URL Configuration의 Redirect URLs에 등록된 값.
// Electron main process가 app://orbit 프로토콜을 잡아서 handleAuthCallback에 전달.
export const REDIRECT_URL = 'app://orbit/auth/callback'

export function createAuth({
  getClient = getSupabaseClient,
  openExternal = (url) => shell.openExternal(url),
  tokenStore = null
} = {}) {
  return {
    async signInWithGoogle() {
      const client = getClient()
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_URL,
          scopes: GOOGLE_SCOPES,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          },
          // Electron main에선 SDK가 직접 redirect할 화면이 없다. URL만 받아서 외부 브라우저로 연다.
          skipBrowserRedirect: true
        }
      })
      if (error) throw error
      if (!data?.url) throw new Error('OAuth URL not returned from Supabase')
      await openExternal(data.url)
      return { url: data.url }
    },

    async handleAuthCallback(callbackUrl) {
      const url = new URL(callbackUrl)
      const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error')
      if (errorParam) throw new Error(`OAuth error: ${errorParam}`)
      const code = url.searchParams.get('code')
      if (!code) throw new Error('OAuth callback missing code parameter')
      const client = getClient()
      const { data, error } = await client.auth.exchangeCodeForSession(code)
      if (error) throw error
      // Google provider_token / provider_refresh_token이 session에 함께 옴 — Plan 4용으로 보관
      if (tokenStore && data?.session) {
        try { tokenStore.saveFromSession(data.session) } catch { /* secure-storage 실패해도 로그인 자체는 성공 처리 */ }
      }
      return data
    },

    async getSession() {
      const client = getClient()
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      return data.session
    },

    async getUser() {
      const session = await this.getSession()
      return session?.user || null
    },

    async signOut() {
      const client = getClient()
      const { error } = await client.auth.signOut()
      if (error) throw error
      if (tokenStore) {
        try { tokenStore.clear() } catch { /* signOut 후 토큰 정리 실패는 무시 (다음 로그인 시 덮어씌워짐) */ }
      }
    }
  }
}

let _auth = null
let _googleTokens = null

export function getGoogleTokensSingleton() {
  if (_googleTokens) return _googleTokens
  _googleTokens = createGoogleTokens({
    storage: getSecureStorage(),
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret
  })
  return _googleTokens
}

export function getAuth() {
  if (_auth) return _auth
  _auth = createAuth({ tokenStore: getGoogleTokensSingleton() })
  return _auth
}

export function __resetAuthForTest() {
  _auth = null
  _googleTokens = null
}

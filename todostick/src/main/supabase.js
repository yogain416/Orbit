import { createClient } from '@supabase/supabase-js'
import { config, assertConfigured } from './config.js'
import { getSecureStorage } from './secure-storage.js'

// 테스트 가능한 순수 팩토리 — url/anonKey/storage를 모두 주입받는다.
export function createSupabaseClient({ url, anonKey, storage }) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Electron에선 redirect URL이 브라우저가 아니라 main process의 deep link로 들어오므로,
      // supabase-js의 URL fragment 자동 파싱은 꺼두고 우리가 직접 code를 exchange한다.
      detectSessionInUrl: false,
      flowType: 'pkce',
      storage
    }
  })
}

let _client = null

export function getSupabaseClient() {
  if (_client) return _client
  assertConfigured()
  _client = createSupabaseClient({
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    storage: getSecureStorage()
  })
  return _client
}

export function __resetSupabaseClientForTest() {
  _client = null
}

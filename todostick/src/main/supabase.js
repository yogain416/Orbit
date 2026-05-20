import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
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
    },
    // Electron 29의 내장 Node는 20.x — native WebSocket이 없어서 SDK가 모듈 init 시 throw.
    // Realtime 자체는 안 쓰지만 import 시점에 초기화되므로 ws를 transport로 명시.
    realtime: {
      transport: WebSocket
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

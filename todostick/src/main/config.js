import dotenv from 'dotenv'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

// 개발: 리포 루트의 .env. 프로덕션: app 경로의 .env (또는 환경변수)
function loadEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return

  const candidates = []
  if (process.cwd()) candidates.push(join(process.cwd(), '.env'))
  // packaged 앱에선 .env가 resources/ 안에 들어간다 (electron-builder extraResources).
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, '.env'))
  if (app?.getAppPath) {
    try { candidates.push(join(app.getAppPath(), '.env')) } catch {}
  }
  if (app?.getPath) {
    try { candidates.push(join(app.getPath('userData'), '.env')) } catch {}
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv.config({ path })
      break
    }
  }
}

loadEnv()

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  // Plan 4 — Google API direct refresh (오프라인에서 access token 재발급용).
  // Supabase의 Google provider 설정에 등록한 OAuth client와 동일한 값.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
}

export function assertConfigured() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.')
  }
}

export function assertGoogleConfigured() {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET가 설정되지 않았습니다. .env에 추가하세요. (Plan 4 — Google sync에 필요)')
  }
}

// ── 로컬(오프라인) 프로필 ────────────────────────────────────────
// Google 로그인 없이 쓰는 게스트 모드. 최대 3명, 닉네임으로 구분.
// 각 프로필은 합성 user_id(`local:<id>`)로 로컬 SQLite에서 격리되며,
// Supabase 동기화는 하지 않는다(이 PC에서만 보이는 데이터).
//
// 프로필 목록/활성 프로필은 settings 테이블(PC별 글로벌, user 비격리)에 보관.

export const LOCAL_UID_PREFIX = 'local:'
export const MAX_LOCAL_PROFILES = 3
export const PROFILE_COLORS = ['#6366f1', '#10b981', '#f59e0b']

const PROFILES_KEY = 'localProfiles'
const ACTIVE_KEY = 'activeLocalProfile'

export function isLocalUid(uid) {
  return typeof uid === 'string' && uid.startsWith(LOCAL_UID_PREFIX)
}

export function localUidFor(profileId) {
  return LOCAL_UID_PREFIX + profileId
}

export function getLocalProfiles(db) {
  const list = db.getSetting(PROFILES_KEY)
  return Array.isArray(list) ? list : []
}

function saveLocalProfiles(db, list) {
  db.setSetting(PROFILES_KEY, list)
}

export function createLocalProfile(db, nickname) {
  const name = String(nickname || '').trim()
  if (!name) throw new Error('닉네임을 입력하세요.')
  if (name.length > 20) throw new Error('닉네임은 20자 이하로 입력하세요.')
  const list = getLocalProfiles(db)
  if (list.length >= MAX_LOCAL_PROFILES) {
    throw new Error(`로컬 플레이어는 최대 ${MAX_LOCAL_PROFILES}명까지 만들 수 있습니다.`)
  }
  // Date.now/Math.random은 main 프로세스에서 정상 사용 가능 (Workflow 스크립트 제약과 무관).
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const profile = {
    id,
    nickname: name,
    color: PROFILE_COLORS[list.length % PROFILE_COLORS.length],
    createdAt: new Date().toISOString()
  }
  saveLocalProfiles(db, [...list, profile])
  return profile
}

export function deleteLocalProfile(db, id) {
  const next = getLocalProfiles(db).filter((p) => p.id !== id)
  saveLocalProfiles(db, next)
  if (db.getSetting(ACTIVE_KEY) === id) setActiveLocalProfile(db, null)
  return next
}

export function getActiveLocalProfile(db) {
  const id = db.getSetting(ACTIVE_KEY)
  if (!id) return null
  return getLocalProfiles(db).find((p) => p.id === id) || null
}

export function setActiveLocalProfile(db, id) {
  // 빈 문자열로 클리어 — null을 넣으면 settings에 "null" 문자열로 보관되어 다루기 번거로움.
  db.setSetting(ACTIVE_KEY, id || '')
}

// 렌더러의 AuthGate/UserMenu가 Supabase 세션과 동일하게 다룰 수 있는 합성 세션.
export function buildLocalSession(profile) {
  if (!profile) return null
  return {
    user: {
      id: localUidFor(profile.id),
      email: null,
      isLocal: true,
      user_metadata: {
        full_name: profile.nickname,
        name: profile.nickname,
        local_color: profile.color
      }
    }
  }
}

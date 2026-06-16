import { describe, it, expect, beforeEach } from 'vitest'
import {
  isLocalUid,
  localUidFor,
  getLocalProfiles,
  createLocalProfile,
  deleteLocalProfile,
  getActiveLocalProfile,
  setActiveLocalProfile,
  buildLocalSession,
  MAX_LOCAL_PROFILES
} from './local-profiles.js'

// settings 테이블을 흉내내는 인메모리 db. 실제 getSetting/setSetting과 동일한 의미(키-값).
function makeDb() {
  const store = new Map()
  return {
    getSetting: (k) => (store.has(k) ? store.get(k) : undefined),
    setSetting: (k, v) => { store.set(k, v) }
  }
}

describe('local-profiles', () => {
  let db
  beforeEach(() => { db = makeDb() })

  it('uid helpers', () => {
    expect(localUidFor('abc')).toBe('local:abc')
    expect(isLocalUid('local:abc')).toBe(true)
    expect(isLocalUid('uuid-1234')).toBe(false)
    expect(isLocalUid(null)).toBe(false)
  })

  it('빈 목록에서 시작', () => {
    expect(getLocalProfiles(db)).toEqual([])
  })

  it('프로필 생성 — 닉네임/색상 부여, 순서대로 색 배정', () => {
    const a = createLocalProfile(db, ' 앨리스 ')
    expect(a.nickname).toBe('앨리스') // trim
    expect(a.id).toBeTruthy()
    expect(a.color).toBeTruthy()
    const b = createLocalProfile(db, '밥')
    expect(getLocalProfiles(db)).toHaveLength(2)
    expect(b.color).not.toBe(a.color) // 인덱스별 다른 색
  })

  it('닉네임 검증 — 빈값/길이 초과', () => {
    expect(() => createLocalProfile(db, '   ')).toThrow()
    expect(() => createLocalProfile(db, 'x'.repeat(21))).toThrow()
  })

  it(`최대 ${MAX_LOCAL_PROFILES}명 제한`, () => {
    for (let i = 0; i < MAX_LOCAL_PROFILES; i++) createLocalProfile(db, `p${i}`)
    expect(() => createLocalProfile(db, 'overflow')).toThrow()
    expect(getLocalProfiles(db)).toHaveLength(MAX_LOCAL_PROFILES)
  })

  it('활성 프로필 get/set', () => {
    const a = createLocalProfile(db, '앨리스')
    expect(getActiveLocalProfile(db)).toBeNull()
    setActiveLocalProfile(db, a.id)
    expect(getActiveLocalProfile(db)?.id).toBe(a.id)
    setActiveLocalProfile(db, null) // 클리어
    expect(getActiveLocalProfile(db)).toBeNull()
  })

  it('삭제 — 활성 프로필 삭제 시 활성 해제', () => {
    const a = createLocalProfile(db, '앨리스')
    const b = createLocalProfile(db, '밥')
    setActiveLocalProfile(db, a.id)
    const rest = deleteLocalProfile(db, a.id)
    expect(rest.map((p) => p.id)).toEqual([b.id])
    expect(getActiveLocalProfile(db)).toBeNull() // 활성이던 a 삭제 → 해제
  })

  it('비활성 프로필 삭제는 활성 유지', () => {
    const a = createLocalProfile(db, '앨리스')
    const b = createLocalProfile(db, '밥')
    setActiveLocalProfile(db, a.id)
    deleteLocalProfile(db, b.id)
    expect(getActiveLocalProfile(db)?.id).toBe(a.id)
  })

  it('합성 세션 구조 — AuthGate/UserMenu 호환', () => {
    const a = createLocalProfile(db, '앨리스')
    const session = buildLocalSession(a)
    expect(session.user.id).toBe(`local:${a.id}`)
    expect(session.user.isLocal).toBe(true)
    expect(session.user.user_metadata.full_name).toBe('앨리스')
    expect(buildLocalSession(null)).toBeNull()
  })
})

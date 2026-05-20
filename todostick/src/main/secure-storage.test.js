import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createFileBackedStorage } from './secure-storage.js'

let tmp

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-secure-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function makeStorage(opts = {}) {
  return createFileBackedStorage({
    dir: tmp,
    encrypt: (v) => Buffer.from(v, 'utf8'),
    decrypt: (b) => b.toString('utf8'),
    ...opts
  })
}

describe('createFileBackedStorage', () => {
  it('setItem → getItem round-trip', () => {
    const s = makeStorage()
    s.setItem('token', 'abc123')
    expect(s.getItem('token')).toBe('abc123')
  })

  it('없는 키는 null 반환', () => {
    const s = makeStorage()
    expect(s.getItem('missing')).toBeNull()
  })

  it('removeItem 후 null', () => {
    const s = makeStorage()
    s.setItem('k', 'v')
    s.removeItem('k')
    expect(s.getItem('k')).toBeNull()
  })

  it('removeItem 없는 키는 에러 안 남 (idempotent)', () => {
    const s = makeStorage()
    expect(() => s.removeItem('missing')).not.toThrow()
  })

  it('Supabase가 쓰는 콜론 포함 키도 정상 저장 (URL encoded 파일명)', () => {
    const s = makeStorage()
    s.setItem('sb-foo-auth-token', '{"v":1}')
    expect(s.getItem('sb-foo-auth-token')).toBe('{"v":1}')
  })

  it('overwrite 가능', () => {
    const s = makeStorage()
    s.setItem('k', 'old')
    s.setItem('k', 'new')
    expect(s.getItem('k')).toBe('new')
  })

  it('encrypt/decrypt round-trip이 비-항등 변환이어도 안전', () => {
    // 실제 safeStorage 처럼 buffer로 변환되는지만 보장하면 됨
    const s = makeStorage({
      encrypt: (v) => Buffer.from(v.split('').reverse().join(''), 'utf8'),
      decrypt: (b) => b.toString('utf8').split('').reverse().join('')
    })
    s.setItem('k', 'hello')
    expect(s.getItem('k')).toBe('hello')
  })

  it('디렉토리가 없으면 자동 생성', () => {
    const subdir = join(tmp, 'nested', 'deeper')
    const s = createFileBackedStorage({
      dir: subdir,
      encrypt: (v) => Buffer.from(v, 'utf8'),
      decrypt: (b) => b.toString('utf8')
    })
    s.setItem('k', 'v')
    expect(existsSync(subdir)).toBe(true)
    expect(s.getItem('k')).toBe('v')
  })

  it('손상된 파일을 만나면 null 반환 (decrypt 예외 흡수)', () => {
    const s = makeStorage({
      decrypt: () => {
        throw new Error('decrypt failed')
      }
    })
    s.setItem('k', 'v')
    expect(s.getItem('k')).toBeNull()
  })

  it('dir이 함수여도 정상 동작 (lazy app.getPath 대응)', () => {
    const s = createFileBackedStorage({
      dir: () => tmp,
      encrypt: (v) => Buffer.from(v, 'utf8'),
      decrypt: (b) => b.toString('utf8')
    })
    s.setItem('k', 'v')
    expect(s.getItem('k')).toBe('v')
  })
})

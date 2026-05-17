import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { migrateUserData } from './userdata-migration.js'

let tmp

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'orbit-test-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('migrateUserData', () => {
  it('기존 todostick 폴더가 있고 orbit 폴더가 비어있으면 todostick.json을 복사한다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{"tasks":[{"id":"a"}]}')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(true)
    expect(existsSync(join(orbitDir, 'todostick.json'))).toBe(true)
    expect(readFileSync(join(orbitDir, 'todostick.json'), 'utf-8')).toBe('{"tasks":[{"id":"a"}]}')
  })

  it('orbit 폴더에 이미 todostick.json이 있으면 덮어쓰지 않는다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    mkdirSync(orbitDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{"tasks":[{"id":"old"}]}')
    writeFileSync(join(orbitDir, 'todostick.json'), '{"tasks":[{"id":"new"}]}')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('target-exists')
    expect(readFileSync(join(orbitDir, 'todostick.json'), 'utf-8')).toBe('{"tasks":[{"id":"new"}]}')
  })

  it('기존 todostick 폴더가 없으면 아무것도 안 한다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('source-missing')
  })

  it('orbit 디렉토리가 없으면 생성한다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{}')

    const result = migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(result.migrated).toBe(true)
    expect(existsSync(orbitDir)).toBe(true)
  })

  it('todostick.json 외 다른 파일은 복사하지 않는다', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{}')
    writeFileSync(join(todostickDir, 'other.txt'), 'noise')

    migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(existsSync(join(orbitDir, 'other.txt'))).toBe(false)
  })

  it('마이그레이션 후 원본은 그대로 둔다 (안전)', () => {
    const todostickDir = join(tmp, 'todostick')
    const orbitDir = join(tmp, 'orbit')
    mkdirSync(todostickDir)
    writeFileSync(join(todostickDir, 'todostick.json'), '{"v":1}')

    migrateUserData({ oldDir: todostickDir, newDir: orbitDir })

    expect(existsSync(join(todostickDir, 'todostick.json'))).toBe(true)
  })
})

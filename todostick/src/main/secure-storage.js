import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'

// dir, encrypt, decrypt를 주입받아 supabase-js storage interface를 만족하는 동기 storage 반환.
// encrypt: (string) → Buffer. decrypt: (Buffer) → string. dir은 문자열 또는 함수(lazy).
export function createFileBackedStorage({ dir, encrypt, decrypt }) {
  function resolveDir() {
    return typeof dir === 'function' ? dir() : dir
  }
  function pathFor(key) {
    return join(resolveDir(), encodeURIComponent(key) + '.bin')
  }
  function ensureDir() {
    const d = resolveDir()
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }

  return {
    getItem(key) {
      const p = pathFor(key)
      if (!existsSync(p)) return null
      try {
        return decrypt(readFileSync(p))
      } catch {
        return null
      }
    },
    setItem(key, value) {
      ensureDir()
      writeFileSync(pathFor(key), encrypt(String(value)))
    },
    removeItem(key) {
      const p = pathFor(key)
      if (existsSync(p)) unlinkSync(p)
    }
  }
}

// 프로덕션 wrapper — Electron safeStorage + userData/secure 폴더.
// 테스트에선 createFileBackedStorage를 직접 쓰고, 이 wrapper는 import 안 함.
let _secureStorage = null

export function getSecureStorage() {
  if (_secureStorage) return _secureStorage
  _secureStorage = createFileBackedStorage({
    dir: () => join(app.getPath('userData'), 'secure'),
    encrypt: (value) => {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(value)
      }
      return Buffer.from(value, 'utf8')
    },
    decrypt: (buffer) => {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buffer)
      }
      return buffer.toString('utf8')
    }
  })
  return _secureStorage
}

export function __resetSecureStorageForTest() {
  _secureStorage = null
}

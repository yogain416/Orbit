import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'

const DB_FILENAME = 'todostick.json'

export function migrateUserData({ oldDir, newDir }) {
  if (!existsSync(oldDir)) {
    return { migrated: false, reason: 'source-missing' }
  }

  const oldFile = join(oldDir, DB_FILENAME)
  if (!existsSync(oldFile)) {
    return { migrated: false, reason: 'source-missing' }
  }

  if (!existsSync(newDir)) {
    mkdirSync(newDir, { recursive: true })
  }

  const newFile = join(newDir, DB_FILENAME)
  if (existsSync(newFile)) {
    return { migrated: false, reason: 'target-exists' }
  }

  copyFileSync(oldFile, newFile)
  return { migrated: true, from: oldFile, to: newFile }
}

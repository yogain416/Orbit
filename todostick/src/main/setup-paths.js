// dev 모드면 userData를 별도 폴더로 분리 → prod 데이터 보호
// 반드시 main/index.js의 첫 번째 import여야 함
// (database.js의 dbPath 평가 전에 app.setPath가 호출되어야 하기 때문)
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

if (is.dev) {
  const devUserData = join(app.getPath('appData'), 'todostick-dev')
  app.setPath('userData', devUserData)
  // eslint-disable-next-line no-console
  console.log('[DEV] userData →', devUserData)
}

export const isDev = is.dev

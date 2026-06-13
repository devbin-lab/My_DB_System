import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

// 렌더러로 보내는 업데이트 상태.
// idle: 대기 / checking: 확인 중 / available: 새 버전 발견(자동 다운로드 시작)
// not-available: 이미 최신 / downloading: 내려받는 중 / downloaded: 설치 준비 완료
// error: 실패 / dev: 개발 모드(업데이트 비활성)
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  notes?: string
  percent?: number
  error?: string
}

let lastStatus: UpdateStatus = { state: 'idle' }

function broadcast(status: UpdateStatus): void {
  lastStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', status)
  }
}

// GitHub 릴리스 본문(릴리스 노트)을 짧은 문자열로 정리한다.
function notesToText(notes: unknown): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes.map((n) => (n && typeof n === 'object' ? (n as { note?: string }).note : n)).join('\n\n')
  }
  return undefined
}

export function registerUpdater(): void {
  // 자동 다운로드 켜기: 새 버전이 있으면 바로 내려받고, 앱 종료 시 설치한다.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ state: 'available', version: info.version, notes: notesToText(info.releaseNotes) })
  )
  autoUpdater.on('update-not-available', (info) =>
    broadcast({ state: 'not-available', version: info.version })
  )
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'downloaded', version: info.version, notes: notesToText(info.releaseNotes) })
  )
  autoUpdater.on('error', (err) =>
    broadcast({ state: 'error', error: err == null ? 'unknown' : (err.message ?? String(err)) })
  )

  // 현재 상태 조회(설정창을 열 때 사용)
  ipcMain.handle('update:getStatus', () => lastStatus)

  // 업데이트 확인. 개발 모드(미패키징)에서는 동작하지 않으므로 안내만 한다.
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      broadcast({ state: 'dev' })
      return lastStatus
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      broadcast({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    return lastStatus
  })

  // 내려받은 업데이트를 설치하고 재시작한다.
  ipcMain.handle('update:install', () => {
    if (lastStatus.state === 'downloaded') autoUpdater.quitAndInstall()
  })

  // 시작 후 한 번 조용히 확인(패키징된 경우에만). 실패는 무시.
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        /* 오프라인 등은 무시 */
      })
    }, 4000)
  }
}

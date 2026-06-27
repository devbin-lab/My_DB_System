import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { join, extname, basename, dirname, parse } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { registerUpdater } from './updater'
import { checkToken, listRepos, getRepoTree } from './github'
import { dataDir, filesDir, fromDbRel, legacyJsonPath, setPaths, toDbRel } from './paths'
import type { LibraryItem } from './db'
import {
  initDb,
  closeDb,
  getDb,
  detectType,
  detectSystemLanguage,
  setSystemLanguage,
  TYPE_DIRS,
  store,
  pivotStore,
  linkStore,
  itemLinkStore,
  pivotLinkStore,
  settingsStore
} from './db'

interface AppConfig {
  storageDir: string
  onboarded: boolean // 첫 실행 마법사를 끝냈는지 여부
  githubToken?: string // GitHub PAT(safeStorage로 암호화하여 보관, enc:/raw: 접두)
}

// 앱 전역 설정(메모리 캐시). config.json과 항상 동기화한다.
let appConfig: AppConfig

function configFilePath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function defaultConfig(): AppConfig {
  return { storageDir: join(app.getPath('documents'), 'MyDataSystem'), onboarded: false }
}

function loadConfig(): AppConfig {
  const def = defaultConfig()
  try {
    const cfg = JSON.parse(fs.readFileSync(configFilePath(), 'utf8')) as Partial<AppConfig>
    return {
      storageDir: cfg.storageDir || def.storageDir,
      onboarded: cfg.onboarded ?? false,
      githubToken: cfg.githubToken
    }
  } catch {
    // 설정 파일이 없으면 기본값 사용(= 첫 실행)
    return def
  }
}

function saveConfig(cfg: AppConfig): void {
  fs.writeFileSync(configFilePath(), JSON.stringify(cfg, null, 2), 'utf8')
}

// 일부 필드만 바꾸면서 나머지(특히 onboarded)는 보존한다.
function updateConfig(patch: Partial<AppConfig>): void {
  appConfig = { ...appConfig, ...patch }
  saveConfig(appConfig)
}

// ---------- 파일 가져오기 ----------
// 같은 이름이 이미 있으면 "이름 (1).확장자" 식으로 비켜간다.
function uniqueDest(dir: string, fileName: string): string {
  const { name, ext } = parse(fileName)
  let dest = join(dir, fileName)
  let n = 1
  while (fs.existsSync(dest)) {
    dest = join(dir, `${name} (${n})${ext}`)
    n++
  }
  return dest
}

function registerFile(relPath: string, originalPath: string): LibraryItem | null {
  const storedPath = fromDbRel(relPath)
  const stat = fs.statSync(storedPath)
  const name = basename(storedPath)
  const ext = extname(storedPath).toLowerCase()
  const item = {
    id: crypto.randomUUID(),
    name,
    ext,
    type: detectType(ext),
    tags: [] as string[],
    size: stat.size,
    relPath,
    originalPath,
    createdAt: new Date().toISOString()
  }
  store.insert(item)
  return store.get(item.id) ?? null
}

function importFile(srcPath: string): LibraryItem | null {
  try {
    const stat = fs.statSync(srcPath)
    if (!stat.isFile()) return null

    const type = detectType(extname(srcPath))
    const typeDir = join(filesDir, TYPE_DIRS[type])
    fs.mkdirSync(typeDir, { recursive: true })
    const dest = uniqueDest(typeDir, basename(srcPath))
    fs.copyFileSync(srcPath, dest)

    return registerFile(toDbRel(dest), srcPath)
  } catch (err) {
    console.error('importFile failed:', srcPath, err)
    return null
  }
}

// 폴더를 재귀적으로 임포트한다.
// - 폴더명을 피벗으로 만들고, 하위 폴더는 자식 피벗(부모→자식)으로 잇는다.
// - 각 폴더의 파일은 타입별 저장(importFile) 후 그 폴더의 피벗에 연결한다.
// - 가져온 파일들은 added 배열에 모은다(렌더러가 선택/표시에 사용).
function importFolder(dirPath: string, parentPivotId: string | null, added: LibraryItem[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (err) {
    console.error('importFolder failed:', dirPath, err)
    return
  }
  const pivot = pivotStore.create(basename(dirPath))
  if (parentPivotId) pivotLinkStore.add(parentPivotId, pivot.id) // 부모 → 자식
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      importFolder(full, pivot.id, added)
    } else if (entry.isFile()) {
      const item = importFile(full)
      if (item) {
        added.push(item)
        linkStore.add(pivot.id, item.id)
      }
    }
  }
}

// 피벗을 하위 전체와 함께 휴지통으로 보낸다(소프트 삭제).
// - 자식 방향(pivot_links: a=부모→b=자식)으로 서브트리 피벗을 모두 모은다.
// - 서브트리 피벗에 연결된 파일 중, 서브트리 바깥 피벗에 연결이 없는(=고아가 되는) 파일만 삭제한다.
//   (다른 피벗에도 속한 공유 파일은 보존)
// 한 피벗의 하위 전체(자식·손자…)를 BFS로 모은다(pivot_links의 a→b 방향).
function collectPivotSubtree(rootId: string): Set<string> {
  const rows = getDb().prepare('SELECT a_id, b_id FROM pivot_links').all() as Array<{
    a_id: string
    b_id: string
  }>
  const subtree = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    for (const l of rows) {
      if (l.a_id === cur && !subtree.has(l.b_id)) {
        subtree.add(l.b_id)
        queue.push(l.b_id)
      }
    }
  }
  return subtree
}

function removePivotCascade(rootId: string): void {
  const subtree = collectPivotSubtree(rootId)
  const linkRows = getDb().prepare('SELECT pivot_id, item_id FROM links').all() as Array<{
    pivot_id: string
    item_id: string
  }>
  // 서브트리 피벗에 연결된 파일들 중 외부 연결이 없는 것만 삭제
  const candidates = new Set(
    linkRows.filter((l) => subtree.has(l.pivot_id)).map((l) => l.item_id)
  )
  // 트랜잭션으로 한 번에 커밋 → 중간에 끊겨도 반만 삭제되는 일이 없다(WAL 자동커밋 방지).
  getDb().transaction(() => {
    for (const itemId of candidates) {
      const hasExternal = linkRows.some((l) => l.item_id === itemId && !subtree.has(l.pivot_id))
      if (!hasExternal) store.softDelete(itemId)
    }
    for (const pid of subtree) pivotStore.softDelete(pid)
  })()
}

// 피벗을 하위 전체와 함께 휴지통에서 복원한다(cascade 삭제의 역방향).
// 서브트리 피벗 + 그 피벗들에 연결된 파일을 모두 복원한다.
function restorePivotCascade(rootId: string): void {
  const subtree = collectPivotSubtree(rootId)
  const linkRows = getDb().prepare('SELECT pivot_id, item_id FROM links').all() as Array<{
    pivot_id: string
    item_id: string
  }>
  getDb().transaction(() => {
    for (const pid of subtree) pivotStore.restore(pid)
    for (const l of linkRows) {
      if (subtree.has(l.pivot_id)) store.restore(l.item_id)
    }
  })()
}

// 저장된 파일의 이름을 바꾼다(디스크 + DB 동시). 확장자가 바뀌면 타입도 재계산.
function renameItem(id: string, newNameRaw: string): LibraryItem | null {
  const item = store.get(id)
  if (!item) return null
  const newName = newNameRaw.trim()
  if (!newName || newName === item.name) return item

  const dir = dirname(item.storedPath)
  const dest = uniqueDest(dir, newName)
  fs.renameSync(item.storedPath, dest)

  const ext = extname(dest).toLowerCase()
  getDb().prepare(
    'UPDATE items SET name = ?, ext = ?, type = ?, rel_path = ? WHERE id = ?'
  ).run(basename(dest), ext, detectType(ext), toDbRel(dest), id)
  return store.get(id) ?? null
}

// ---------- 구버전 JSON → SQLite 마이그레이션 ----------
function migrateFromJson(): void {
  if (!fs.existsSync(legacyJsonPath)) return
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyJsonPath, 'utf8')) as Array<{
      id: string
      name: string
      storedPath: string
      originalPath: string
      tags: string[]
    }>
    for (const old of legacy) {
      if (!fs.existsSync(old.storedPath)) continue
      // uuid 폴더에서 타입별 폴더로 파일 이동
      const type = detectType(extname(old.name))
      const typeDir = join(filesDir, TYPE_DIRS[type])
      fs.mkdirSync(typeDir, { recursive: true })
      const dest = uniqueDest(typeDir, old.name)
      fs.renameSync(old.storedPath, dest)

      const item = registerFile(toDbRel(dest), old.originalPath)
      if (item && old.tags.length > 0) store.setTags(item.id, old.tags)

      // 비어버린 uuid 폴더 정리
      const oldDir = dirname(old.storedPath)
      if (fs.existsSync(oldDir) && fs.readdirSync(oldDir).length === 0) {
        fs.rmdirSync(oldDir)
      }
    }
    fs.renameSync(legacyJsonPath, legacyJsonPath + '.bak')
    console.log(`migrated ${legacy.length} items from library.json`)
  } catch (err) {
    console.error('JSON migration failed:', err)
  }
}

// ---------- IPC ----------
function registerIpc(): void {
  ipcMain.handle('library:list', () => store.list())

  ipcMain.handle('library:getDataDir', () => dataDir)

  ipcMain.handle('library:openDataDir', () => shell.openPath(filesDir))

  // 현재 저장소 루트 경로
  ipcMain.handle('storage:get', () => dataDir)

  // 폴더 선택 다이얼로그
  ipcMain.handle('storage:choose', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '데이터를 저장할 폴더 선택',
      defaultPath: dataDir
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 저장소 위치 변경: 기존 데이터를 새 폴더로 옮기고 DB를 다시 연다
  // 저장소 위치 "전환"만 한다 — 기존 폴더의 데이터는 절대 옮기거나 지우지 않는다.
  // 새 폴더에 library.db가 없으면 openStorage→initDb가 빈 DB를 만든다(빈 저장소로 시작).
  ipcMain.handle('storage:set', (_e, newDir: string) => {
    if (!newDir || newDir === dataDir) return dataDir
    const prev = dataDir
    closeDb()
    try {
      openStorage(newDir)
      updateConfig({ storageDir: newDir })
    } catch (err) {
      openStorage(prev) // 실패 시 원래 위치로 복구
      throw err
    }
    return dataDir
  })

  // 백업 내보내기: 저장소 전체(files/ + library.db)를 선택한 폴더 아래에
  // 타임스탬프 폴더로 복사한다. 복사 전 WAL 체크포인트로 DB 일관성을 보장한다.
  // 반환: 생성된 백업 폴더 경로(취소 시 null).
  ipcMain.handle('backup:export', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '백업을 저장할 폴더 선택'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      getDb().pragma('wal_checkpoint(TRUNCATE)') // WAL을 본 DB로 합쳐 일관된 사본 보장
    } catch (err) {
      console.error('wal_checkpoint failed:', err)
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const destDir = join(result.filePaths[0], `MyDataSystem-backup-${stamp}`)
    await fs.promises.cp(dataDir, destDir, { recursive: true }) // 대용량도 메인 블로킹 없이
    return destDir
  })

  // (백업 "가져오기/열기" 기능은 제거됨 — 백업은 내보내기 전용. 다른 폴더의 데이터를 쓰려면
  //  저장소 변경으로 그 폴더를 가리키면 된다. 저장소 변경은 이동/삭제 없이 전환만 한다.)

  // ----- GitHub 계정 저장소 그래프(읽기 전용) -----
  // PAT는 safeStorage로 암호화해 config에 보관한다. (enc: 암호화 / raw: 폴백)
  const decryptToken = (): string | null => {
    const v = appConfig.githubToken
    if (!v) return null
    try {
      if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'))
      if (v.startsWith('raw:')) return Buffer.from(v.slice(4), 'base64').toString('utf8')
    } catch {
      return null
    }
    return null
  }

  // 토큰 저장(유효성 검사 후). 빈 값이면 삭제.
  ipcMain.handle('github:setToken', async (_e, token: string) => {
    if (!token) {
      updateConfig({ githubToken: undefined })
      return { ok: false }
    }
    const user = await checkToken(token)
    if (!user) return { ok: false, error: 'invalidToken' }
    const stored = safeStorage.isEncryptionAvailable()
      ? 'enc:' + safeStorage.encryptString(token).toString('base64')
      : 'raw:' + Buffer.from(token, 'utf8').toString('base64')
    updateConfig({ githubToken: stored })
    return { ok: true, login: user.login }
  })

  ipcMain.handle('github:hasToken', () => !!appConfig.githubToken)
  ipcMain.handle('github:clearToken', () => {
    updateConfig({ githubToken: undefined })
    return true
  })

  // 계정의 모든 repo + 계정 로그인명(중앙 최상위 노드용)
  ipcMain.handle('github:repos', async () => {
    const token = decryptToken()
    if (!token) return { error: 'noToken' }
    try {
      const [user, repos] = await Promise.all([checkToken(token), listRepos(token)])
      return { repos, login: user?.login ?? '' }
    } catch (err) {
      const status = (err as { status?: number }).status
      return { error: status === 401 ? 'invalidToken' : 'fetchFailed' }
    }
  })

  // repo 하나의 파일 트리
  ipcMain.handle('github:tree', async (_e, owner: string, repo: string, branch: string) => {
    const token = decryptToken()
    if (!token) return { error: 'noToken' }
    try {
      return { tree: await getRepoTree(token, owner, repo, branch) }
    } catch (err) {
      // 만료된 토큰(401)은 github:repos처럼 재인증을 유도하도록 invalidToken으로 매핑
      const status = (err as { status?: number }).status
      return { error: status === 401 ? 'invalidToken' : 'fetchFailed' }
    }
  })

  // 외부 브라우저로 URL 열기(GitHub 페이지)
  ipcMain.handle('app:openUrl', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  // ----- 첫 실행 온보딩 -----
  ipcMain.handle('app:isOnboarded', () => appConfig.onboarded)
  ipcMain.handle('app:completeOnboarding', () => {
    updateConfig({ onboarded: true })
    return true
  })

  ipcMain.handle('settings:getAll', () => settingsStore.getAll())

  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    settingsStore.set(key, value)
    // 테마가 바뀌면 네이티브 창 컨트롤(타이틀바 오버레이) 색도 맞춘다
    if (key === 'theme') {
      const overlay = THEME_OVERLAY[String(value)] ?? THEME_OVERLAY.slate
      for (const win of BrowserWindow.getAllWindows()) {
        win.setTitleBarOverlay({ ...overlay, height: 52 })
        win.setBackgroundColor(overlay.background)
      }
    }
    return settingsStore.getAll()
  })

  // pivotId가 주어지면 가져온 파일을 그 피벗에 연결한다
  const linkAll = (added: LibraryItem[], pivotId?: string | null): LibraryItem[] => {
    if (pivotId) for (const it of added) linkStore.add(pivotId, it.id)
    return added
  }

  ipcMain.handle('library:importDialog', async (_e, pivotId?: string | null) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '라이브러리에 추가할 파일 선택'
    })
    if (result.canceled) return []
    return linkAll(result.filePaths.map(importFile).filter(Boolean) as LibraryItem[], pivotId)
  })

  // 파일은 그대로 임포트, 폴더는 재귀 임포트(폴더명=피벗, 하위=자식 피벗).
  // 집중 보기 중(pivotId)이면 드롭한 폴더의 루트 피벗을 그 피벗의 자식으로 둔다.
  ipcMain.handle('library:importPaths', (_e, paths: string[], pivotId?: string | null) => {
    const added: LibraryItem[] = []
    for (const p of paths) {
      let isDir = false
      try {
        isDir = fs.statSync(p).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        importFolder(p, pivotId ?? null, added)
      } else {
        const item = importFile(p)
        if (item) {
          added.push(item)
          if (pivotId) linkStore.add(pivotId, item.id)
        }
      }
    }
    return added
  })

  ipcMain.handle('library:rename', (_e, id: string, newName: string) =>
    renameItem(id, newName)
  )

  // ----- 피벗 / 연결 -----
  ipcMain.handle('pivots:list', () => pivotStore.list())
  ipcMain.handle('pivots:create', (_e, name: string) => pivotStore.create(name))
  // 변이 핸들러는 결과를 돌려주지 않는다: 렌더러가 반환값을 버리고 refresh()로 다시 읽으므로
  // 핸들러마다 JOIN 무거운 list()를 재조회하던 건 낭비였다.
  ipcMain.handle('pivots:rename', (_e, id: string, name: string) => {
    pivotStore.rename(id, name)
  })
  // 피벗 삭제 = 휴지통으로(소프트 삭제). 링크는 보존(복원 시 재연결).
  ipcMain.handle('pivots:remove', (_e, id: string) => {
    pivotStore.softDelete(id)
  })
  // 피벗 + 하위 전체 삭제(고아 파일만 함께 휴지통으로).
  ipcMain.handle('pivots:removeCascade', (_e, id: string) => {
    removePivotCascade(id)
  })
  ipcMain.handle('links:list', () => linkStore.list())
  ipcMain.handle('links:add', (_e, pivotId: string, itemId: string) => {
    linkStore.add(pivotId, itemId)
  })
  ipcMain.handle('links:remove', (_e, pivotId: string, itemId: string) => {
    linkStore.remove(pivotId, itemId)
  })

  // ----- 파일 ↔ 파일 연결 -----
  ipcMain.handle('itemLinks:list', () => itemLinkStore.list())
  ipcMain.handle('itemLinks:add', (_e, a: string, b: string) => {
    itemLinkStore.add(a, b)
  })
  ipcMain.handle('itemLinks:remove', (_e, a: string, b: string) => {
    itemLinkStore.remove(a, b)
  })

  // ----- 피벗 ↔ 피벗 연결 -----
  ipcMain.handle('pivotLinks:list', () => pivotLinkStore.list())
  ipcMain.handle('pivotLinks:add', (_e, a: string, b: string) => {
    pivotLinkStore.add(a, b)
  })
  ipcMain.handle('pivotLinks:remove', (_e, a: string, b: string) => {
    pivotLinkStore.remove(a, b)
  })

  // 미리보기로 읽을 최대 파일 크기(이보다 크면 미리보기하지 않는다)
  const PREVIEW_MAX_BYTES = 5 * 1024 * 1024

  // 텍스트 계열 파일 내용 읽기.
  // 비동기로 읽어 메인 프로세스가 멈추지 않게 하고, 너무 크거나 바이너리(NUL 포함)면
  // null을 돌려준다. (pptx 등 바이너리를 텍스트로 읽다 앱이 멈추는 문제 방지)
  ipcMain.handle('library:readText', async (_e, id: string) => {
    const item = store.get(id)
    if (!item) return null
    try {
      const stat = await fs.promises.stat(item.storedPath)
      if (stat.size > PREVIEW_MAX_BYTES) return null
      const buf = await fs.promises.readFile(item.storedPath)
      if (buf.includes(0)) return null // NUL 바이트 = 바이너리로 간주
      return buf.toString('utf8')
    } catch {
      return null
    }
  })

  // pdf/이미지 등 바이너리는 base64로 전달(비동기로 읽어 블로킹 방지)
  ipcMain.handle('library:readBinary', async (_e, id: string) => {
    const item = store.get(id)
    if (!item) return null
    try {
      const buf = await fs.promises.readFile(item.storedPath)
      return buf.toString('base64')
    } catch {
      return null
    }
  })

  // 외부 프로그램(기본 연결 프로그램)으로 열기
  ipcMain.handle('library:openExternal', (_e, id: string) => {
    const item = store.get(id)
    if (!item) return 'item not found'
    return shell.openPath(item.storedPath)
  })

  ipcMain.handle('library:showInFolder', (_e, id: string) => {
    const item = store.get(id)
    if (item) shell.showItemInFolder(item.storedPath)
  })

  // 삭제 = 휴지통으로 보냄(소프트 삭제). 링크·파일은 보존해 복원 가능하게 한다.
  ipcMain.handle('library:remove', (_e, id: string) => {
    store.softDelete(id)
  })

  ipcMain.handle('library:setTags', (_e, id: string, tags: string[]) => {
    store.setTags(id, tags)
    return store.get(id)
  })

  // ----- 휴지통 -----
  // 파일 영구 삭제: DB 행 + 모든 링크 + 디스크 파일 제거.
  const purgeItem = (id: string): void => {
    const item = store.get(id)
    store.remove(id)
    linkStore.removeItem(id)
    itemLinkStore.removeId(id)
    if (item) fs.rmSync(item.storedPath, { force: true })
  }
  // 피벗 영구 삭제: DB 행 + 관련 링크 제거.
  const purgePivot = (id: string): void => {
    pivotStore.remove(id) // 행 + links + pivot_links 정리
  }

  ipcMain.handle('trash:list', () => ({
    items: store.listDeleted(),
    pivots: pivotStore.listDeleted()
  }))

  ipcMain.handle('trash:restore', (_e, kind: 'item' | 'pivot', id: string) => {
    // 피벗 복원은 하위(자식 피벗·연결된 파일)까지 함께 되살린다.
    if (kind === 'item') store.restore(id)
    else restorePivotCascade(id)
  })

  ipcMain.handle('trash:purge', (_e, kind: 'item' | 'pivot', id: string) => {
    if (kind === 'item') purgeItem(id)
    else purgePivot(id)
  })

  ipcMain.handle('trash:empty', () => {
    for (const it of store.listDeleted()) purgeItem(it.id)
    for (const pv of pivotStore.listDeleted()) purgePivot(pv.id)
  })
}

// ---------- 윈도우 ----------
// 테마별 타이틀바 오버레이/배경 색
const THEME_OVERLAY: Record<string, { color: string; symbolColor: string; background: string }> =
  {
    slate: { color: '#21242f', symbolColor: '#9aa1b5', background: '#1b1e27' },
    light: { color: '#ffffff', symbolColor: '#6b7287', background: '#f5f6f8' },
    navy: { color: '#16202f', symbolColor: '#8da0bd', background: '#0f1726' }
  }

function createWindow(): void {
  const theme = String(settingsStore.getAll().theme ?? 'slate')
  const overlay = THEME_OVERLAY[theme] ?? THEME_OVERLAY.slate
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'My DB System',
    backgroundColor: overlay.background,
    // 커스텀 타이틀바: 네이티브 프레임을 숨기고 상단 툴바를 드래그 영역으로 사용.
    // 최소화/최대화/닫기 버튼은 Windows 네이티브 오버레이로 유지(스냅 레이아웃 동작).
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: overlay.color,
      symbolColor: overlay.symbolColor,
      height: 52
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.setMenuBarVisibility(false)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openStorage(dir: string): void {
  setPaths(dir)
  fs.mkdirSync(filesDir, { recursive: true })
  initDb()
  migrateFromJson()
}

// ---------- 단일 인스턴스 보장 ----------
// 패키징된 앱에서만 락을 건다. 락을 얻지 못하면(= 이미 실행 중이면) 즉시 종료해
// 아이콘을 눌러도 창이 하나만 유지되게 한다.
// 개발 모드(npm run dev)에서는 설치본과 락이 충돌해 dev가 안 뜨는 걸 막기 위해 적용하지 않는다.
const ownsSingleInstance = !app.isPackaged || app.requestSingleInstanceLock()

if (!ownsSingleInstance) {
  app.quit()
} else {
  // 두 번째 실행 시도가 들어오면 기존 창을 복원/포커스한다.
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const win = wins[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    } else {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    setSystemLanguage(detectSystemLanguage())
    appConfig = loadConfig()
    openStorage(appConfig.storageDir)
    registerIpc()
    registerUpdater()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}


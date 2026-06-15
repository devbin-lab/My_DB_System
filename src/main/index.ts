import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, extname, basename, relative, dirname, parse, sep } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { registerUpdater } from './updater'

// ---------- 데이터 저장 위치 ----------
// 저장소 루트(dataDir)는 설정에서 바꿀 수 있다.
// 어느 폴더에 데이터가 있는지는 DB가 아니라 별도 config.json(userData)에 기록한다.
// files\ 아래는 타입별 폴더 + 원본 파일명 구조라서 탐색기에서 그대로 열람 가능.
let dataDir = ''
let filesDir = ''
let dbPath = ''
let legacyJsonPath = ''

function setPaths(dir: string): void {
  dataDir = dir
  filesDir = join(dir, 'files')
  dbPath = join(dir, 'library.db')
  legacyJsonPath = join(dir, 'library.json')
}

// DB에는 OS 독립적인 상대경로(항상 '/')를 저장한다.
// 그래야 같은 데이터 폴더를 윈도우/리눅스에서 함께 써도 파일 경로가 깨지지 않는다.
function toDbRel(absPath: string): string {
  return relative(filesDir, absPath).split(sep).join('/')
}

// DB의 '/' 상대경로를 현재 OS의 절대경로로 되돌린다.
function fromDbRel(rel: string): string {
  return join(filesDir, ...rel.split('/'))
}

interface AppConfig {
  storageDir: string
  onboarded: boolean // 첫 실행 마법사를 끝냈는지 여부
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
      onboarded: cfg.onboarded ?? false
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

// ---------- 타입 ----------
export type ItemType = 'md' | 'pdf' | 'csv' | 'code' | 'image' | 'other'

export interface LibraryItem {
  id: string
  name: string
  ext: string
  type: ItemType
  tags: string[]
  size: number
  storedPath: string
  originalPath: string
  createdAt: string
}

// 탐색기에서 보이는 타입별 폴더 이름
const TYPE_DIRS: Record<ItemType, string> = {
  md: 'Markdown',
  pdf: 'PDF',
  csv: 'CSV',
  code: 'Code',
  image: 'Images',
  other: 'Other'
}

// ---------- 확장자 → 타입 분류 ----------
const CODE_EXTS = new Set([
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.py', '.css', '.scss', '.js', '.ts',
  '.jsx', '.tsx', '.json', '.html', '.xml', '.yml', '.yaml', '.sh', '.bat', '.ps1',
  '.java', '.kt', '.rs', '.go', '.lua', '.sql', '.toml', '.ini', '.txt'
])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

function detectType(ext: string): ItemType {
  const e = ext.toLowerCase()
  if (e === '.md' || e === '.markdown') return 'md'
  if (e === '.pdf') return 'pdf'
  if (e === '.csv' || e === '.tsv') return 'csv'
  if (CODE_EXTS.has(e)) return 'code'
  if (IMAGE_EXTS.has(e)) return 'image'
  return 'other'
}

// ---------- SQLite 저장소 ----------
// rel_path: filesDir 기준 상대 경로 (예: Markdown\메모.md)
interface ItemRow {
  id: string
  name: string
  ext: string
  type: string
  tags: string
  size: number
  rel_path: string
  original_path: string
  created_at: string
}

let db: Database.Database

function initDb(): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ext TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      size INTEGER NOT NULL DEFAULT 0,
      rel_path TEXT NOT NULL UNIQUE,
      original_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pivots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS links (
      pivot_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      PRIMARY KEY (pivot_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS item_links (
      a_id TEXT NOT NULL,
      b_id TEXT NOT NULL,
      PRIMARY KEY (a_id, b_id)
    );
    CREATE TABLE IF NOT EXISTS pivot_links (
      a_id TEXT NOT NULL,
      b_id TEXT NOT NULL,
      PRIMARY KEY (a_id, b_id)
    );
  `)

  // 구버전(윈도우)에서 만든 DB는 rel_path에 역슬래시가 들어있다.
  // 같은 데이터 폴더를 OS 간 공유할 수 있도록 '/'로 일괄 정규화한다(1회성, 이후엔 대상 없음).
  db.exec("UPDATE items SET rel_path = REPLACE(rel_path, '\\', '/') WHERE instr(rel_path, '\\') > 0;")
}

export interface Pivot {
  id: string
  name: string
  createdAt: string
}

export interface Link {
  pivotId: string
  itemId: string
}

const pivotStore = {
  list(): Pivot[] {
    return (
      db.prepare('SELECT id, name, created_at AS createdAt FROM pivots ORDER BY created_at') .all() as Pivot[]
    )
  },
  create(name: string): Pivot {
    const pivot: Pivot = {
      id: crypto.randomUUID(),
      name: name.trim() || '새 피벗',
      createdAt: new Date().toISOString()
    }
    db.prepare('INSERT INTO pivots (id, name, created_at) VALUES (?, ?, ?)').run(
      pivot.id,
      pivot.name,
      pivot.createdAt
    )
    return pivot
  },
  rename(id: string, name: string): void {
    db.prepare('UPDATE pivots SET name = ? WHERE id = ?').run(name.trim() || '새 피벗', id)
  },
  remove(id: string): void {
    db.prepare('DELETE FROM pivots WHERE id = ?').run(id)
    db.prepare('DELETE FROM links WHERE pivot_id = ?').run(id)
    pivotLinkStore.removeId(id)
  }
}

const linkStore = {
  list(): Link[] {
    return db
      .prepare('SELECT pivot_id AS pivotId, item_id AS itemId FROM links')
      .all() as Link[]
  },
  add(pivotId: string, itemId: string): void {
    db.prepare(
      'INSERT OR IGNORE INTO links (pivot_id, item_id) VALUES (?, ?)'
    ).run(pivotId, itemId)
  },
  remove(pivotId: string, itemId: string): void {
    db.prepare('DELETE FROM links WHERE pivot_id = ? AND item_id = ?').run(pivotId, itemId)
  },
  removeItem(itemId: string): void {
    db.prepare('DELETE FROM links WHERE item_id = ?').run(itemId)
  }
}

export interface ItemLink {
  aId: string
  bId: string
}

// 같은 종류끼리 연결하는 공통 저장소.
// - 파일↔파일: 방향 없음. 중복을 막기 위해 항상 (작은 id, 큰 id) 순서로 저장.
// - 피벗↔피벗: 방향 있음(부모→자식). a_id=부모, b_id=자식 순서를 그대로 저장한다.
function makePairStore(table: string, directed = false) {
  return {
    list(): ItemLink[] {
      return db.prepare(`SELECT a_id AS aId, b_id AS bId FROM ${table}`).all() as ItemLink[]
    },
    // 방향 있는 연결은 x=부모, y=자식으로 그대로 저장한다.
    add(x: string, y: string): void {
      if (x === y) return
      const [a, b] = directed ? [x, y] : x < y ? [x, y] : [y, x]
      if (directed) {
        // 반대 방향(자식→부모)이 이미 있으면 제거해 한 쌍에 한 방향만 유지한다.
        db.prepare(`DELETE FROM ${table} WHERE a_id = ? AND b_id = ?`).run(b, a)
      }
      db.prepare(`INSERT OR IGNORE INTO ${table} (a_id, b_id) VALUES (?, ?)`).run(a, b)
    },
    // 제거는 방향과 무관하게 두 노드 사이 연결을 지운다.
    remove(x: string, y: string): void {
      if (directed) {
        db.prepare(
          `DELETE FROM ${table} WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)`
        ).run(x, y, y, x)
        return
      }
      const [a, b] = x < y ? [x, y] : [y, x]
      db.prepare(`DELETE FROM ${table} WHERE a_id = ? AND b_id = ?`).run(a, b)
    },
    removeId(id: string): void {
      db.prepare(`DELETE FROM ${table} WHERE a_id = ? OR b_id = ?`).run(id, id)
    }
  }
}

const itemLinkStore = makePairStore('item_links')
const pivotLinkStore = makePairStore('pivot_links', true)

// ---------- 설정(키-값) ----------
const DEFAULT_SETTINGS = {
  maxSearchResults: 12, // 그래프 우클릭 검색에서 표시할 최대 결과 수
  theme: 'slate', // slate | light | navy
  accent: 'teal', // violet | teal | blue | amber | green
  language: 'en' // ko | en | ja (실제 기본값은 systemLanguage로 대체된다)
}

type Settings = typeof DEFAULT_SETTINGS

// OS 로케일에서 추정한 기본 언어. 사용자가 한 번도 고르지 않았을 때만 쓰인다.
// app.getLocale()은 ready 이후에만 호출 가능하므로 whenReady에서 채운다.
let systemLanguage: 'ko' | 'en' | 'ja' = 'en'

function detectSystemLanguage(): 'ko' | 'en' | 'ja' {
  const loc = app.getLocale().toLowerCase()
  if (loc.startsWith('ko')) return 'ko'
  if (loc.startsWith('ja')) return 'ja'
  return 'en'
}

const settingsStore = {
  getAll(): Settings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>
    // 저장된 언어가 없으면 시스템 언어를 기본값으로 노출한다.
    const result = { ...DEFAULT_SETTINGS, language: systemLanguage } as Record<string, unknown>
    for (const r of rows) {
      try {
        result[r.key] = JSON.parse(r.value)
      } catch {
        result[r.key] = r.value
      }
    }
    return result as Settings
  },
  set(key: string, value: unknown): void {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, JSON.stringify(value))
  }
}

function rowToItem(row: ItemRow): LibraryItem {
  return {
    id: row.id,
    name: row.name,
    ext: row.ext,
    type: row.type as ItemType,
    tags: JSON.parse(row.tags),
    size: row.size,
    storedPath: fromDbRel(row.rel_path),
    originalPath: row.original_path,
    createdAt: row.created_at
  }
}

const store = {
  list(): LibraryItem[] {
    const rows = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as ItemRow[]
    return rows.map(rowToItem)
  },
  get(id: string): LibraryItem | undefined {
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined
    return row ? rowToItem(row) : undefined
  },
  hasRelPath(relPath: string): boolean {
    return !!db.prepare('SELECT 1 FROM items WHERE rel_path = ?').get(relPath)
  },
  insert(item: Omit<LibraryItem, 'storedPath'> & { relPath: string }): void {
    db.prepare(
      `INSERT INTO items (id, name, ext, type, tags, size, rel_path, original_path, created_at)
       VALUES (@id, @name, @ext, @type, @tags, @size, @relPath, @originalPath, @createdAt)`
    ).run({ ...item, tags: JSON.stringify(item.tags) })
  },
  remove(id: string): void {
    db.prepare('DELETE FROM items WHERE id = ?').run(id)
  },
  setTags(id: string, tags: string[]): void {
    db.prepare('UPDATE items SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id)
  }
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
  db.prepare(
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
  ipcMain.handle('storage:set', (_e, newDir: string) => {
    if (!newDir || newDir === dataDir) return dataDir
    const oldDir = dataDir
    db.close() // 현재 DB 핸들을 닫아야 파일을 옮길 수 있다
    try {
      moveStorage(oldDir, newDir)
    } catch (err) {
      console.error('moveStorage failed:', err)
      // 실패하면 원래 위치로 복구
      openStorage(oldDir)
      throw err
    }
    updateConfig({ storageDir: newDir })
    openStorage(newDir)
    return dataDir
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

  ipcMain.handle('library:importPaths', (_e, paths: string[], pivotId?: string | null) => {
    return linkAll(paths.map(importFile).filter(Boolean) as LibraryItem[], pivotId)
  })

  ipcMain.handle('library:rename', (_e, id: string, newName: string) =>
    renameItem(id, newName)
  )

  // ----- 피벗 / 연결 -----
  ipcMain.handle('pivots:list', () => pivotStore.list())
  ipcMain.handle('pivots:create', (_e, name: string) => pivotStore.create(name))
  ipcMain.handle('pivots:rename', (_e, id: string, name: string) => {
    pivotStore.rename(id, name)
    return pivotStore.list()
  })
  ipcMain.handle('pivots:remove', (_e, id: string) => {
    pivotStore.remove(id)
    return pivotStore.list()
  })
  ipcMain.handle('links:list', () => linkStore.list())
  ipcMain.handle('links:add', (_e, pivotId: string, itemId: string) => {
    linkStore.add(pivotId, itemId)
    return linkStore.list()
  })
  ipcMain.handle('links:remove', (_e, pivotId: string, itemId: string) => {
    linkStore.remove(pivotId, itemId)
    return linkStore.list()
  })

  // ----- 파일 ↔ 파일 연결 -----
  ipcMain.handle('itemLinks:list', () => itemLinkStore.list())
  ipcMain.handle('itemLinks:add', (_e, a: string, b: string) => {
    itemLinkStore.add(a, b)
    return itemLinkStore.list()
  })
  ipcMain.handle('itemLinks:remove', (_e, a: string, b: string) => {
    itemLinkStore.remove(a, b)
    return itemLinkStore.list()
  })

  // ----- 피벗 ↔ 피벗 연결 -----
  ipcMain.handle('pivotLinks:list', () => pivotLinkStore.list())
  ipcMain.handle('pivotLinks:add', (_e, a: string, b: string) => {
    pivotLinkStore.add(a, b)
    return pivotLinkStore.list()
  })
  ipcMain.handle('pivotLinks:remove', (_e, a: string, b: string) => {
    pivotLinkStore.remove(a, b)
    return pivotLinkStore.list()
  })

  // 텍스트 계열 파일 내용 읽기
  ipcMain.handle('library:readText', (_e, id: string) => {
    const item = store.get(id)
    if (!item) return null
    return fs.readFileSync(item.storedPath, 'utf8')
  })

  // pdf/이미지 등 바이너리는 base64로 전달
  ipcMain.handle('library:readBinary', (_e, id: string) => {
    const item = store.get(id)
    if (!item) return null
    return fs.readFileSync(item.storedPath).toString('base64')
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

  ipcMain.handle('library:remove', (_e, id: string) => {
    const item = store.get(id)
    if (!item) return
    store.remove(id)
    linkStore.removeItem(id)
    itemLinkStore.removeId(id)
    fs.rmSync(item.storedPath, { force: true })
  })

  ipcMain.handle('library:setTags', (_e, id: string, tags: string[]) => {
    store.setTags(id, tags)
    return store.get(id)
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

// 저장소 폴더를 통째로 새 위치로 옮긴다(파일 + DB).
// 대상 폴더에 이미 같은 항목이 있으면 덮어쓰지 않고 그쪽을 사용한다.
function moveStorage(oldDir: string, newDir: string): void {
  fs.mkdirSync(newDir, { recursive: true })
  if (!fs.existsSync(oldDir)) return
  // 1) 기존 데이터를 새 폴더로 복사(대상에 없는 것만)
  for (const entry of fs.readdirSync(oldDir)) {
    const src = join(oldDir, entry)
    const dest = join(newDir, entry)
    if (!fs.existsSync(dest)) fs.cpSync(src, dest, { recursive: true })
  }
  // 2) 옮긴 뒤 기존 폴더 정리(실패해도 무시)
  for (const entry of fs.readdirSync(oldDir)) {
    try {
      fs.rmSync(join(oldDir, entry), { recursive: true, force: true })
    } catch {
      // 사용 중인 파일 등은 건너뜀
    }
  }
}

function openStorage(dir: string): void {
  setPaths(dir)
  fs.mkdirSync(filesDir, { recursive: true })
  initDb()
  migrateFromJson()
}

// ---------- 단일 인스턴스 보장 ----------
// 락을 얻지 못하면(= 이미 실행 중이면) 두 번째 인스턴스는 즉시 종료한다.
// 이게 없으면 아이콘을 누를 때마다 새 창이 계속 떠버린다.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
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
    systemLanguage = detectSystemLanguage()
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

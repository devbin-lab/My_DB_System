// SQLite 데이터 계층: 타입 + 스키마/마이그레이션 + 스토어.
// db 핸들은 이 모듈이 소유하며, 저장소 전환 시 closeDb()→initDb()로 재오픈한다.
import { app } from 'electron'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { dbPath, fromDbRel } from './paths'

// ---------- 타입 ----------
export type ItemType = 'md' | 'pdf' | 'csv' | 'code' | 'image' | 'ppt' | 'xls' | 'other'

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
export const TYPE_DIRS: Record<ItemType, string> = {
  md: 'Markdown',
  pdf: 'PDF',
  csv: 'CSV',
  code: 'Code',
  image: 'Images',
  ppt: 'Slides',
  xls: 'Excel',
  other: 'Other'
}

// ---------- 확장자 → 타입 분류 ----------
const CODE_EXTS = new Set([
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.py', '.css', '.scss', '.js', '.ts',
  '.jsx', '.tsx', '.json', '.html', '.xml', '.yml', '.yaml', '.sh', '.bat', '.ps1',
  '.java', '.kt', '.rs', '.go', '.lua', '.sql', '.toml', '.ini', '.txt'
])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

export function detectType(ext: string): ItemType {
  const e = ext.toLowerCase()
  if (e === '.md' || e === '.markdown') return 'md'
  if (e === '.pdf') return 'pdf'
  if (e === '.csv' || e === '.tsv') return 'csv'
  if (e === '.ppt' || e === '.pptx') return 'ppt'
  if (e === '.xls' || e === '.xlsx' || e === '.xlsm') return 'xls'
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

export function initDb(): void {
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

  // ppt 타입 도입 전에 'other'로 분류됐던 pptx/ppt 파일을 'ppt'로 재분류(1회성).
  db.exec("UPDATE items SET type = 'ppt' WHERE type = 'other' AND (ext = '.ppt' OR ext = '.pptx');")
  // xls 타입 도입 전에 'other'로 분류됐던 엑셀 파일을 'xls'로 재분류(1회성).
  db.exec(
    "UPDATE items SET type = 'xls' WHERE type = 'other' AND (ext = '.xls' OR ext = '.xlsx' OR ext = '.xlsm');"
  )

  // 휴지통(소프트 삭제)용 deleted_at 컬럼 추가(이미 있으면 무시).
  const hasColumn = (table: string, col: string): boolean =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
      (c) => c.name === col
    )
  if (!hasColumn('items', 'deleted_at')) db.exec('ALTER TABLE items ADD COLUMN deleted_at TEXT')
  if (!hasColumn('pivots', 'deleted_at')) db.exec('ALTER TABLE pivots ADD COLUMN deleted_at TEXT')

  // 핫 경로 인덱스: 링크/페어 테이블의 두 번째 컬럼(복합 PK 인덱스가 못 커버) + soft-delete 필터용.
  // 그래프 list()/JOIN과 removeId/cascade가 매번 풀스캔하던 것을 인덱스 조회로 바꾼다. 멱등.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_links_item ON links(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_links_b ON item_links(b_id);
    CREATE INDEX IF NOT EXISTS idx_pivot_links_b ON pivot_links(b_id);
    CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_pivots_deleted ON pivots(deleted_at);
  `)
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

export const pivotStore = {
  list(): Pivot[] {
    return db
      .prepare(
        'SELECT id, name, created_at AS createdAt FROM pivots WHERE deleted_at IS NULL ORDER BY created_at'
      )
      .all() as Pivot[]
  },
  listDeleted(): Pivot[] {
    return db
      .prepare(
        'SELECT id, name, created_at AS createdAt FROM pivots WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
      )
      .all() as Pivot[]
  },
  softDelete(id: string): void {
    db.prepare('UPDATE pivots SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  },
  restore(id: string): void {
    db.prepare('UPDATE pivots SET deleted_at = NULL WHERE id = ?').run(id)
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

export const linkStore = {
  // 삭제(휴지통)된 피벗·파일을 참조하는 연결은 제외한다.
  list(): Link[] {
    return db
      .prepare(
        `SELECT l.pivot_id AS pivotId, l.item_id AS itemId FROM links l
         JOIN pivots p ON p.id = l.pivot_id AND p.deleted_at IS NULL
         JOIN items i ON i.id = l.item_id AND i.deleted_at IS NULL`
      )
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
function makePairStore(table: string, nodeTable: string, directed = false) {
  return {
    // 삭제(휴지통)된 노드를 참조하는 연결은 제외한다.
    list(): ItemLink[] {
      return db
        .prepare(
          `SELECT t.a_id AS aId, t.b_id AS bId FROM ${table} t
           JOIN ${nodeTable} na ON na.id = t.a_id AND na.deleted_at IS NULL
           JOIN ${nodeTable} nb ON nb.id = t.b_id AND nb.deleted_at IS NULL`
        )
        .all() as ItemLink[]
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

export const itemLinkStore = makePairStore('item_links', 'items')
export const pivotLinkStore = makePairStore('pivot_links', 'pivots', true)

// ---------- 설정(키-값) ----------
const DEFAULT_SETTINGS = {
  maxSearchResults: 12, // 그래프 우클릭 검색에서 표시할 최대 결과 수
  theme: 'slate', // slate | light | navy
  accent: 'teal', // 기본 액센트(설정에서 10색 팔레트 중 선택 — AccentId 참고)
  language: 'en', // ko | en | ja (실제 기본값은 systemLanguage로 대체된다)
  combineGraphs: false // 그래프 뷰 + GitHub 뷰를 한 화면에 통합할지
}

type Settings = typeof DEFAULT_SETTINGS

// OS 로케일에서 추정한 기본 언어. 사용자가 한 번도 고르지 않았을 때만 쓰인다.
// app.getLocale()은 ready 이후에만 호출 가능하므로 whenReady에서 채운다.
let systemLanguage: 'ko' | 'en' | 'ja' = 'en'

export function detectSystemLanguage(): 'ko' | 'en' | 'ja' {
  const loc = app.getLocale().toLowerCase()
  if (loc.startsWith('ko')) return 'ko'
  if (loc.startsWith('ja')) return 'ja'
  return 'en'
}

export const settingsStore = {
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

export const store = {
  list(): LibraryItem[] {
    const rows = db
      .prepare('SELECT * FROM items WHERE deleted_at IS NULL ORDER BY created_at DESC')
      .all() as ItemRow[]
    return rows.map(rowToItem)
  },
  listDeleted(): LibraryItem[] {
    const rows = db
      .prepare('SELECT * FROM items WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all() as ItemRow[]
    return rows.map(rowToItem)
  },
  softDelete(id: string): void {
    db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  },
  restore(id: string): void {
    db.prepare('UPDATE items SET deleted_at = NULL WHERE id = ?').run(id)
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

// ---------- db 핸들 접근 / 수명주기 ----------
export const getDb = (): Database.Database => db
export function closeDb(): void {
  db.close()
}
export function setSystemLanguage(lang: 'ko' | 'en' | 'ja'): void {
  systemLanguage = lang
}

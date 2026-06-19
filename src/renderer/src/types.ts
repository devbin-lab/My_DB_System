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

export type ThemeId = 'slate' | 'light' | 'navy'
export type AccentId = 'violet' | 'teal' | 'blue' | 'amber' | 'green'
export type Language = 'ko' | 'en' | 'ja'

export interface Settings {
  maxSearchResults: number
  theme: ThemeId
  accent: AccentId
  language: Language
  combineGraphs: boolean // 그래프 뷰 + GitHub 뷰 통합 표시 여부
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

export interface ItemLink {
  aId: string
  bId: string
}

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

// ----- GitHub 계정 저장소 그래프(읽기 전용) -----
export interface GitHubRepo {
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  private: boolean
  fork: boolean
  description: string | null
  language: string | null
  htmlUrl: string
  updatedAt: string
}

export interface GitHubTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export type GitHubReposResult = { repos: GitHubRepo[]; login: string } | { error: string }
export type GitHubTreeResult = { tree: GitHubTreeEntry[] } | { error: string }
export type GitHubTokenResult = { ok: boolean; login?: string; error?: string }

export interface Api {
  list: () => Promise<LibraryItem[]>
  getVersion: () => Promise<string>
  checkUpdate: () => Promise<UpdateStatus>
  getUpdateStatus: () => Promise<UpdateStatus>
  installUpdate: () => Promise<void>
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  getDataDir: () => Promise<string>
  openDataDir: () => Promise<string>
  getStorageDir: () => Promise<string>
  chooseStorageDir: () => Promise<string | null>
  setStorageDir: (dir: string) => Promise<string>
  exportBackup: () => Promise<string | null>
  isOnboarded: () => Promise<boolean>
  completeOnboarding: () => Promise<boolean>
  getSettings: () => Promise<Settings>
  setSetting: (key: keyof Settings, value: unknown) => Promise<Settings>
  importDialog: (pivotId?: string | null) => Promise<LibraryItem[]>
  importPaths: (paths: string[], pivotId?: string | null) => Promise<LibraryItem[]>
  rename: (id: string, newName: string) => Promise<LibraryItem | null>
  listPivots: () => Promise<Pivot[]>
  createPivot: (name: string) => Promise<Pivot>
  renamePivot: (id: string, name: string) => Promise<Pivot[]>
  removePivot: (id: string) => Promise<Pivot[]>
  removePivotCascade: (id: string) => Promise<Pivot[]>
  listLinks: () => Promise<Link[]>
  addLink: (pivotId: string, itemId: string) => Promise<Link[]>
  removeLink: (pivotId: string, itemId: string) => Promise<Link[]>
  listItemLinks: () => Promise<ItemLink[]>
  addItemLink: (a: string, b: string) => Promise<ItemLink[]>
  removeItemLink: (a: string, b: string) => Promise<ItemLink[]>
  listPivotLinks: () => Promise<ItemLink[]>
  addPivotLink: (a: string, b: string) => Promise<ItemLink[]>
  removePivotLink: (a: string, b: string) => Promise<ItemLink[]>
  readText: (id: string) => Promise<string | null>
  readBinary: (id: string) => Promise<string | null>
  openExternal: (id: string) => Promise<string>
  showInFolder: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setTags: (id: string, tags: string[]) => Promise<LibraryItem>
  listTrash: () => Promise<{ items: LibraryItem[]; pivots: Pivot[] }>
  restoreTrash: (kind: 'item' | 'pivot', id: string) => Promise<void>
  purgeTrash: (kind: 'item' | 'pivot', id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  githubSetToken: (token: string) => Promise<GitHubTokenResult>
  githubHasToken: () => Promise<boolean>
  githubClearToken: () => Promise<boolean>
  githubRepos: () => Promise<GitHubReposResult>
  githubTree: (owner: string, repo: string, branch: string) => Promise<GitHubTreeResult>
  openUrl: (url: string) => Promise<void>
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    api: Api
  }
}

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

export type ThemeId = 'slate' | 'light' | 'navy'
export type AccentId = 'violet' | 'teal' | 'blue' | 'amber' | 'green'

export interface Settings {
  maxSearchResults: number
  theme: ThemeId
  accent: AccentId
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

// 피벗↔피벗 연결도 같은 형태(aId/bId)
export type PivotLink = ItemLink

export interface Api {
  list: () => Promise<LibraryItem[]>
  getDataDir: () => Promise<string>
  openDataDir: () => Promise<string>
  getStorageDir: () => Promise<string>
  chooseStorageDir: () => Promise<string | null>
  setStorageDir: (dir: string) => Promise<string>
  getSettings: () => Promise<Settings>
  setSetting: (key: string, value: unknown) => Promise<Settings>
  importDialog: (pivotId?: string | null) => Promise<LibraryItem[]>
  importPaths: (paths: string[], pivotId?: string | null) => Promise<LibraryItem[]>
  rename: (id: string, newName: string) => Promise<LibraryItem | null>
  listPivots: () => Promise<Pivot[]>
  createPivot: (name: string) => Promise<Pivot>
  renamePivot: (id: string, name: string) => Promise<Pivot[]>
  removePivot: (id: string) => Promise<Pivot[]>
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
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    api: Api
  }
}

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'

const api = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  // 업데이트
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  getUpdateStatus: () => ipcRenderer.invoke('update:getStatus'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (status: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, status: unknown) => cb(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  list: () => ipcRenderer.invoke('library:list'),
  getDataDir: () => ipcRenderer.invoke('library:getDataDir'),
  openDataDir: () => ipcRenderer.invoke('library:openDataDir'),
  getStorageDir: () => ipcRenderer.invoke('storage:get'),
  chooseStorageDir: () => ipcRenderer.invoke('storage:choose'),
  setStorageDir: (dir: string) => ipcRenderer.invoke('storage:set', dir),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  openBackup: () => ipcRenderer.invoke('backup:open'),
  isOnboarded: () => ipcRenderer.invoke('app:isOnboarded'),
  completeOnboarding: () => ipcRenderer.invoke('app:completeOnboarding'),
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings:set', key, value),
  importDialog: (pivotId?: string | null) =>
    ipcRenderer.invoke('library:importDialog', pivotId),
  importPaths: (paths: string[], pivotId?: string | null) =>
    ipcRenderer.invoke('library:importPaths', paths, pivotId),
  rename: (id: string, newName: string) =>
    ipcRenderer.invoke('library:rename', id, newName),
  // 피벗 / 연결
  listPivots: () => ipcRenderer.invoke('pivots:list'),
  createPivot: (name: string) => ipcRenderer.invoke('pivots:create', name),
  renamePivot: (id: string, name: string) =>
    ipcRenderer.invoke('pivots:rename', id, name),
  removePivot: (id: string) => ipcRenderer.invoke('pivots:remove', id),
  removePivotCascade: (id: string) => ipcRenderer.invoke('pivots:removeCascade', id),
  listLinks: () => ipcRenderer.invoke('links:list'),
  addLink: (pivotId: string, itemId: string) =>
    ipcRenderer.invoke('links:add', pivotId, itemId),
  removeLink: (pivotId: string, itemId: string) =>
    ipcRenderer.invoke('links:remove', pivotId, itemId),
  listItemLinks: () => ipcRenderer.invoke('itemLinks:list'),
  addItemLink: (a: string, b: string) => ipcRenderer.invoke('itemLinks:add', a, b),
  removeItemLink: (a: string, b: string) => ipcRenderer.invoke('itemLinks:remove', a, b),
  listPivotLinks: () => ipcRenderer.invoke('pivotLinks:list'),
  addPivotLink: (a: string, b: string) => ipcRenderer.invoke('pivotLinks:add', a, b),
  removePivotLink: (a: string, b: string) => ipcRenderer.invoke('pivotLinks:remove', a, b),
  readText: (id: string) => ipcRenderer.invoke('library:readText', id),
  readBinary: (id: string) => ipcRenderer.invoke('library:readBinary', id),
  openExternal: (id: string) => ipcRenderer.invoke('library:openExternal', id),
  showInFolder: (id: string) => ipcRenderer.invoke('library:showInFolder', id),
  remove: (id: string) => ipcRenderer.invoke('library:remove', id),
  setTags: (id: string, tags: string[]) => ipcRenderer.invoke('library:setTags', id, tags),
  // 휴지통
  listTrash: () => ipcRenderer.invoke('trash:list'),
  restoreTrash: (kind: 'item' | 'pivot', id: string) =>
    ipcRenderer.invoke('trash:restore', kind, id),
  purgeTrash: (kind: 'item' | 'pivot', id: string) => ipcRenderer.invoke('trash:purge', kind, id),
  emptyTrash: () => ipcRenderer.invoke('trash:empty'),
  // 드래그&드롭된 File 객체에서 실제 경로 추출
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

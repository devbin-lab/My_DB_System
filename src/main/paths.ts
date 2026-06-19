import { join, relative, sep } from 'path'

// ---------- 데이터 저장 위치 ----------
// 저장소 루트(dataDir)는 설정에서 바꿀 수 있다. setPaths로만 갱신되고,
// 다른 모듈은 import한 값을 ES 라이브 바인딩으로 읽는다(항상 최신값).
export let dataDir = ''
export let filesDir = ''
export let dbPath = ''
export let legacyJsonPath = ''

export function setPaths(dir: string): void {
  dataDir = dir
  filesDir = join(dir, 'files')
  dbPath = join(dir, 'library.db')
  legacyJsonPath = join(dir, 'library.json')
}

// DB에는 OS 독립적인 상대경로(항상 '/')를 저장한다.
// 그래야 같은 데이터 폴더를 윈도우/리눅스에서 함께 써도 파일 경로가 깨지지 않는다.
export function toDbRel(absPath: string): string {
  return relative(filesDir, absPath).split(sep).join('/')
}

// DB의 '/' 상대경로를 현재 OS의 절대경로로 되돌린다.
export function fromDbRel(rel: string): string {
  return join(filesDir, ...rel.split('/'))
}

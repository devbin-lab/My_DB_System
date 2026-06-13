# My DB System

나만의 데이터 저장 시스템. 파일을 저장하고, 피벗(주제) 중심의 그래프로 자료 간 관계를 시각화한다.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
[![Release](https://img.shields.io/github/v/release/devbin-lab/My_DB_System?label=latest)](https://github.com/devbin-lab/My_DB_System/releases/latest)

## 다운로드 · 설치

최신 설치 파일은 **[Releases 페이지](https://github.com/devbin-lab/My_DB_System/releases/latest)**
에서 받을 수 있습니다.

| OS | 파일 | 설치 방법 |
|----|------|-----------|
| **Windows** | `my-db-system-<버전>-setup.exe` | 내려받아 실행 → 설치 마법사 진행 |
| **Linux (우분투 등)** | `my-db-system-<버전>.AppImage` | 내려받은 뒤 실행 권한 부여 후 실행 |

**Linux 실행:**

```bash
chmod +x my-db-system-*.AppImage
./my-db-system-*.AppImage
```

> 설치 후 앱 안에서 **새 버전이 나오면 자동으로 업데이트**되므로, 최초 1회만 받으면 됩니다.

## 주요 기능

- **파일 보관함** — md / pdf / csv / 코드 / 이미지 파일을 드래그앤드롭으로 저장, 내장 뷰어로 열람 (외부 프로그램 연동 지원)
- **그래프 뷰** — force-directed 그래프로 자료 시각화 (캔버스 직접 구현, 라이브러리 없음)
- **피벗 시스템** — 주제·프로젝트 단위의 허브 노드를 만들고 파일을 연결. 파일↔파일, 피벗↔피벗 연결도 지원
- **우클릭 방사형 검색** — 빈 곳 우클릭 → 검색 결과가 시계 방향으로 배치
- **테마** — 슬레이트 / 라이트 / 네이비 3종 + 포인트 색상 5종
- **저장소 위치 지정** — 모든 데이터는 지정한 폴더에 타입별로 정리되어 보관, SQLite 메타데이터

- **첫 실행 마법사** — 설치 후 최초 실행 시 테마·저장 위치·그래프 검색 개수를 단계별로 안내
- **자동 업데이트** — 설정창에서 최신 릴리스를 확인하고, 새 버전이 있으면 자동으로 내려받아 재시작 시 설치

## 개발

```bash
npm install          # 의존성 설치 + 네이티브 모듈 자동 리빌드(postinstall)
npm run dev
```

## 빌드

`electron-builder`로 설치 파일을 만든다. 산출물은 `dist/`에 생성된다.
`better-sqlite3`가 네이티브 모듈이라 **설치 파일은 실행할 OS에서 각각 빌드**해야 한다.
(`npm install`의 `postinstall`이 현재 OS·Electron 버전에 맞춰 모듈을 자동 재빌드한다.)

### Windows

```bash
npm run dist:win     # → dist/my-db-system-<ver>-setup.exe (NSIS 설치 마법사)
```

### Linux (우분투)

```bash
npm run dist:linux   # → dist/my-db-system-<ver>.AppImage
```

> 설치 파일 없이 실행만 빠르게 확인하려면 `npm run pack:dir` → `dist/*-unpacked`
>
> 앱 아이콘은 [`build/`](build/README.md)에 `icon.ico`(Windows)·`icon.png`(Linux)를
> 넣으면 적용된다. 없으면 기본 Electron 아이콘이 쓰인다.

## 자동 업데이트 (릴리스 배포)

`electron-updater`가 GitHub 릴리스(`devbin-lab/My_DB_System`)에서 새 버전을 찾는다.
앱 설정창 → **업데이트 → 업데이트 확인**으로 수동 확인할 수 있고, 실행 후에도 한 번
자동으로 확인한다. 새 버전이 있으면 백그라운드로 내려받은 뒤 재시작 시 설치된다.

새 버전을 내보내려면 `package.json`의 `version`을 올린 뒤, GitHub 토큰(repo 권한)을
환경변수로 지정하고 해당 OS에서 빌드·업로드한다.

### Windows

```powershell
$env:GH_TOKEN = "ghp_xxx"
npm run release:win
```

### Linux (우분투)

```bash
export GH_TOKEN=ghp_xxx
npm run release:linux
```

`release:*`는 설치 파일과 업데이트 메타데이터(`latest.yml`/`latest-linux.yml`)를
GitHub에 **초안(draft) 릴리스**로 올린다. GitHub에서 해당 릴리스를 **Publish**하면
README의 다운로드 링크와 기존 사용자 자동 업데이트에 노출된다.

**토큰 없이 수동으로 올리려면** — `npm run dist:win` / `dist:linux`로 빌드한 뒤,
GitHub 저장소 → **Releases → Draft a new release**에서 태그를 만들고 `dist/`의
아래 파일들을 끌어다 첨부한 다음 Publish:

- Windows: `*-setup.exe`, `latest.yml`
- Linux: `*.AppImage`, `latest-linux.yml`

> 업데이트 메타데이터(`latest*.yml`)까지 함께 올려야 인앱 자동 업데이트가 동작한다.
> 단순 다운로드 배포만 원하면 설치 파일(`.exe`/`.AppImage`)만 올려도 된다.

> **참고**
> - 자동 업데이트는 **Windows(NSIS)** 와 **Linux(AppImage)** 에서 동작한다.
> - 설치된 버전보다 릴리스 버전이 높아야 업데이트가 뜬다.
> - 개발 모드(`npm run dev`)에서는 업데이트 확인이 비활성화된다(패키징된 앱에서만 동작).

## 로드맵

- [x] 1단계: 파일 저장/열람 + 외부 프로그램 실행
- [x] 그래프 뷰 + 피벗 시스템

## License

[MIT](LICENSE)

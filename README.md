# My DB System

나만의 데이터 저장 시스템. 파일을 저장하고, 피벗(주제) 중심의 그래프로 자료 간 관계를 시각화한다.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)

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

## 빌드 · 배포

`electron-builder`로 설치 파일을 만든다. 산출물은 `dist/`에 생성된다.

```bash
# 현재 OS용 설치 파일
npm run dist:win     # Windows  → dist/my-db-system-<ver>-setup.exe (NSIS 설치 마법사)
npm run dist:linux   # Linux    → dist/my-db-system-<ver>.AppImage, .deb

npm run pack:dir     # 설치 파일 없이 실행 폴더만(빠른 확인용) → dist/*-unpacked
```

> **플랫폼별 빌드 위치**
> `better-sqlite3`는 네이티브 모듈이라 **실행할 OS에서 빌드**해야 한다.
> Windows 설치 파일은 Windows에서, Linux(AppImage/deb)는 Linux(또는 WSL/Docker)에서
> 빌드하는 것을 권장한다. `npm install`의 `postinstall`이 현재 OS·Electron
> 버전에 맞춰 모듈을 자동으로 다시 빌드한다.
>
> 앱 아이콘은 [`build/`](build/README.md)에 `icon.ico`(Windows)·`icon.png`(Linux)를
> 넣으면 적용된다. 없으면 기본 Electron 아이콘이 쓰인다.

## 자동 업데이트 (릴리스 배포)

`electron-updater`가 GitHub 릴리스(`devbin-lab/My_DB_System`)에서 새 버전을 찾는다.
앱 설정창 → **업데이트 → 업데이트 확인**으로 수동 확인할 수 있고, 실행 후에도 한 번
자동으로 확인한다. 새 버전이 있으면 백그라운드로 내려받은 뒤 재시작 시 설치된다.

새 버전을 내보내려면:

```bash
# 1) package.json의 version 을 올린다 (예: 0.1.0 → 0.1.1)
# 2) GitHub 토큰(repo 권한)을 환경변수로 지정
#    PowerShell:  $env:GH_TOKEN = "ghp_xxx"
#    bash:        export GH_TOKEN=ghp_xxx
# 3) 빌드 + 릴리스 업로드
npm run release:win      # Windows에서
npm run release:linux    # Linux에서
```

`release:*`는 설치 파일과 업데이트 메타데이터(`latest.yml`/`latest-linux.yml`)를
GitHub에 **초안(draft) 릴리스**로 올린다. GitHub에서 해당 릴리스를 **Publish**하면
기존 사용자에게 업데이트가 노출된다.

> **참고**
> - 자동 업데이트는 **Windows(NSIS)** 와 **Linux(AppImage)** 에서 동작한다. `.deb`는
>   업데이트를 지원하지 않으므로 자주 갱신할 사용자는 AppImage를 권장.
> - 설치된 버전보다 릴리스 버전이 높아야 업데이트가 뜬다.
> - 개발 모드(`npm run dev`)에서는 업데이트 확인이 비활성화된다(패키징된 앱에서만 동작).

## 로드맵

- [x] 1단계: 파일 저장/열람 + 외부 프로그램 실행
- [x] 그래프 뷰 + 피벗 시스템
- [ ] 2단계: Unity / Unreal 프로젝트 등록·실행
- [ ] 3단계: GitHub 연동 (열람/기록)
- [ ] 4단계: 갤러리(미술관) UI
- [ ] 5단계: Discord 봇 연동

## License

[MIT](LICENSE)

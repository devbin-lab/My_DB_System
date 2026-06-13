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

## 로드맵

- [x] 1단계: 파일 저장/열람 + 외부 프로그램 실행
- [x] 그래프 뷰 + 피벗 시스템
- [ ] 2단계: Unity / Unreal 프로젝트 등록·실행
- [ ] 3단계: GitHub 연동 (열람/기록)
- [ ] 4단계: 갤러리(미술관) UI
- [ ] 5단계: Discord 봇 연동

## License

[MIT](LICENSE)

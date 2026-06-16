<div align="center">

# My DB System

**흩어진 자료를 한곳에 모으고, 주제 중심의 그래프로 연결해 관리하는 데스크톱 애플리케이션**

파일을 저장하는 것을 넘어, 자료들이 어떤 주제로 어떻게 이어지는지를
관계 그래프로 시각화합니다. 모든 데이터는 사용자의 로컬 디스크에만 보관됩니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg)

[소개](#소개) · [주요 기능](#주요-기능) · [다운로드](#다운로드-및-설치) · [자주 묻는 질문](#자주-묻는-질문)

</div>

---

## 소개

자료가 쌓일수록 폴더 구조는 깊어지고, 필요한 파일을 다시 찾기는 어려워집니다.
My DB System은 파일을 단순히 폴더에 보관하는 대신, **주제(피벗) 단위로 묶고 서로 연결**하여
지식의 맥락을 하나의 그래프 화면에서 파악할 수 있도록 설계되었습니다.

모든 데이터는 사용자가 지정한 로컬 폴더에만 저장됩니다. 별도의 계정, 로그인,
상시 인터넷 연결이 필요하지 않으며, 메타데이터는 SQLite로 관리됩니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 파일 보관함 | 마크다운 · PDF · CSV · 코드 · 이미지를 드래그 앤 드롭으로 저장하고, 내장 뷰어로 즉시 열람합니다. 외부 프로그램으로 열기도 지원합니다. |
| 관계 그래프 뷰 | 외부 라이브러리 없이 Canvas로 구현한 force-directed 그래프로 자료 간 관계를 시각화합니다. |
| 계층형 피벗 시스템 | 주제·프로젝트 단위의 허브(피벗)를 만들어 파일을 연결합니다. 부모–자식 피벗 계층을 구성하면 부모를 열었을 때 하위 피벗과 자료가 함께 펼쳐집니다. 파일 간 직접 연결도 지원합니다. |
| 검색 및 정리 | 그래프에서 우클릭 시 방사형 검색이 펼쳐지며, 목록 화면에서는 타입 필터 · 정렬(최근/이름/크기) · 태그 필터를 제공합니다. |
| 다국어 지원 | 한국어 · English · 日本語 를 지원합니다. 첫 실행 시 선택하고 설정에서 언제든 변경할 수 있습니다. |
| 테마 | 슬레이트 · 라이트 · 네이비 3종 테마와 5종 포인트 색상을 제공합니다. |
| 로컬 저장소 | 모든 데이터는 지정한 폴더에 타입별로 정리되어 보관되며 외부로 전송되지 않습니다. |
| 첫 실행 마법사 | 최초 실행 시 언어 · 테마 · 저장 위치 · 검색 설정을 단계별로 안내합니다. |
| 자동 업데이트 | 새 버전을 자동으로 내려받아 재시작 시 설치합니다(Windows · Linux). |

## 다운로드 및 설치

최신 설치 파일은 [Releases 페이지](https://github.com/devbin-lab/My_DB_System/releases/latest)에서 내려받을 수 있습니다.

| 운영체제 | 파일 | 설치 방법 |
|----------|------|-----------|
| Windows | `my-db-system-<버전>-setup.exe` | 실행 후 설치 마법사 진행 |
| Linux (Ubuntu) | `my-db-system-<버전>.AppImage` | 실행 권한 부여 후 실행 |

Linux에서 AppImage 실행:

```bash
chmod +x my-db-system-*.AppImage
./my-db-system-*.AppImage
```

설치 후에는 앱 내 자동 업데이트가 동작하므로 최초 1회만 내려받으면 됩니다.

## 자주 묻는 질문

**인터넷 연결이 필요한가요?**
필요하지 않습니다. 모든 데이터는 로컬에 저장되며 오프라인으로 동작합니다. 업데이트 확인 시에만 네트워크를 사용합니다.

**데이터는 어디에 저장되나요?**
첫 실행 시 지정한 폴더에 파일 타입별로 정리되어 보관되며, 외부 서버로 전송되지 않습니다.

**지원 언어는 무엇인가요?**
한국어 · English · 日本語 를 지원하며, 설정 화면에서 언제든 변경할 수 있습니다.

**프로그램을 제거할 때 설정도 함께 삭제할 수 있나요?**
Windows 제거 과정에서 설정 및 사용 기록의 완전 삭제 여부를 묻습니다. 삭제를 선택하면 다음 설치 시 첫 실행 마법사가 다시 표시됩니다. 사용자가 저장한 파일과 라이브러리 데이터는 어느 경우에도 보존됩니다.

**무료인가요?**
MIT 라이선스로 공개된 오픈소스이며 자유롭게 사용할 수 있습니다.

## 개발

```bash
npm install   # 의존성 설치 및 네이티브 모듈 재빌드(postinstall)
npm run dev   # 개발 모드 실행
```

설치 파일은 `electron-builder`로 생성하며 산출물은 `dist/`에 저장됩니다.
`better-sqlite3`가 네이티브 모듈이므로 설치 파일은 배포 대상 OS에서 각각 빌드해야 합니다.

```bash
npm run dist:win     # Windows 설치 파일(NSIS)
npm run dist:linux   # Linux AppImage
npm run pack:dir     # 패키징 없이 빠른 실행 확인(dist/*-unpacked)
```

애플리케이션 아이콘은 [`build/`](build/README.md)의 `icon.ico`(Windows) · `icon.png`(Linux)를 사용합니다.

### 릴리스

각 OS에서 직접 빌드하여 GitHub 릴리스에 업로드합니다.

1. `package.json`의 `version`을 증가시킵니다.
2. GitHub 토큰을 환경 변수로 지정한 뒤 빌드·업로드합니다.

```powershell
$env:GH_TOKEN = "<token>"   # Windows (PowerShell)
npm run release:win
```

```bash
export GH_TOKEN=<token>      # Linux
npm run release:linux
```

`release:*` 명령은 설치 파일과 업데이트 메타데이터(`latest.yml` / `latest-linux.yml`)를
초안(draft) 릴리스로 업로드합니다. 내용 확인 후 GitHub에서 Publish하면 다운로드 및
자동 업데이트에 반영됩니다. 토큰 없이 `dist:*`로 빌드한 산출물을 릴리스에 수동으로
첨부할 수도 있습니다.

## 기술 스택

Electron 33 · React 18 · TypeScript 5 · Vite(electron-vite) · better-sqlite3 ·
electron-updater. 그래프 뷰는 외부 라이브러리 없이 Canvas로 구현한 force-directed 그래프입니다.

## 라이선스

[MIT](LICENSE) © devbin

<div align="center">

# 🗂️ My DB System

**흩어진 자료를 한곳에 모으고, 관계로 연결해 한눈에 보는 나만의 데이터 저장소**

파일을 보관하는 것을 넘어, 주제(피벗)를 중심으로 자료들이 어떻게 이어지는지<br/>
그래프로 펼쳐 보여주는 데스크톱 앱입니다.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
[![Release](https://img.shields.io/github/v/release/devbin-lab/My_DB_System?label=다운로드)](https://github.com/devbin-lab/My_DB_System/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[**⬇️ 다운로드**](#-다운로드--설치) · [**✨ 주요 기능**](#-주요-기능) · [**💡 이런 분께 추천**](#-이런-분께-추천)

</div>

---

## My DB System 이란?

자료는 점점 쌓이는데, 폴더는 깊어지고 "그때 그 파일 어디 뒀더라" 하는 경험 있으시죠.

**My DB System** 은 파일을 단순히 폴더에 넣어두는 대신, **주제 단위로 묶고 서로 연결해서**
지식이 어떻게 이어지는지 한 화면에 그래프로 보여줍니다. 마치 머릿속 생각의 지도를
그대로 옮겨놓은 것처럼요.

모든 데이터는 **내 컴퓨터의 지정한 폴더 안에만** 저장됩니다. 클라우드 계정도, 로그인도,
인터넷 연결도 필요 없습니다. 온전히 내 것인, 나만의 데이터베이스입니다.

## ✨ 주요 기능

| | 기능 | 설명 |
|---|------|------|
| 📥 | **간편한 파일 보관함** | 마크다운 · PDF · CSV · 코드 · 이미지를 **드래그앤드롭**으로 저장하고, 앱 안의 내장 뷰어로 바로 열람합니다. 원하면 외부 프로그램으로도 열 수 있어요. |
| 🕸️ | **관계 그래프 뷰** | 자료들이 살아 움직이는 듯한 그래프로 펼쳐집니다. 어떤 자료가 어떤 주제와 이어지는지 직관적으로 보입니다. |
| 🎯 | **피벗(주제) 시스템** | 프로젝트·주제별 허브를 만들어 파일을 연결합니다. 파일↔파일, 주제↔주제 연결까지 자유롭게 묶을 수 있어요. |
| 🔍 | **방사형 검색** | 빈 공간을 우클릭하면 검색 결과가 시계 방향으로 둥글게 펼쳐져, 원하는 자료를 빠르게 찾아 끌어옵니다. |
| 🎨 | **나만의 테마** | 슬레이트 · 라이트 · 네이비 3가지 테마와 5가지 포인트 색상으로 취향껏 꾸밉니다. |
| 📂 | **내 손안의 저장소** | 모든 데이터는 내가 지정한 폴더에 타입별로 정리되어 보관됩니다. 정보는 SQLite로 안전하게 관리돼요. |
| 🚀 | **친절한 첫 시작** | 설치 후 첫 실행 시, 테마 · 저장 위치 · 검색 설정을 단계별 마법사로 안내합니다. |
| 🔄 | **자동 업데이트** | 새 버전이 나오면 앱이 알아서 받아오고, 재시작할 때 설치합니다. 최초 1회만 내려받으면 끝. |

## 💡 이런 분께 추천

- 📚 자료·메모·문서가 여기저기 흩어져 있어 정리가 필요한 분
- 🧠 단순 폴더 정리를 넘어, **자료 사이의 연결과 맥락**을 보고 싶은 분
- 🔒 클라우드 대신 **내 컴퓨터에 직접** 데이터를 보관하고 싶은 분
- 🗺️ 프로젝트·연구·취미 자료를 주제별로 묶어 관리하고 싶은 분

## ⬇️ 다운로드 · 설치

최신 설치 파일은 **[Releases 페이지](https://github.com/devbin-lab/My_DB_System/releases/latest)** 에서 받으세요.

| OS | 파일 | 설치 방법 |
|----|------|-----------|
| 🪟 **Windows** | `my-db-system-<버전>-setup.exe` | 내려받아 실행 → 설치 마법사를 따라가면 끝 |
| 🐧 **Linux (우분투)** | `my-db-system-<버전>.AppImage` | 내려받은 뒤 실행 권한을 주고 실행 |

Linux에서 AppImage 실행:

```bash
chmod +x my-db-system-*.AppImage
./my-db-system-*.AppImage
```

> 💡 설치 후에는 앱 안에서 **새 버전이 나오면 자동으로 업데이트**되므로, 최초 1회만 받으면 됩니다.

## ❓ 자주 묻는 질문

**Q. 인터넷 연결이 필요한가요?**
아니요. 모든 데이터는 내 컴퓨터에 저장되며 오프라인으로 동작합니다. (업데이트 확인 시에만 연결을 사용합니다.)

**Q. 제 데이터는 어디에 저장되나요?**
첫 실행 때 지정한 폴더 안에, 파일 타입별로 정리되어 보관됩니다. 외부 서버로 전송되지 않습니다.

**Q. 무료인가요?**
네. MIT 라이선스로 공개된 오픈소스이며 자유롭게 사용할 수 있습니다.

---

<details>
<summary><b>🛠️ 개발자용 안내 (빌드 · 릴리스)</b></summary>

### 개발 환경

```bash
npm install   # 의존성 설치 + 네이티브 모듈 자동 리빌드(postinstall)
npm run dev
```

### 빌드

`electron-builder`로 설치 파일을 만들며, 산출물은 `dist/`에 생성됩니다.
`better-sqlite3`가 네이티브 모듈이라 **설치 파일은 실행할 OS에서 각각 빌드**해야 합니다.
(`npm install`의 `postinstall`이 현재 OS·Electron 버전에 맞춰 자동 재빌드합니다.)

```bash
npm run dist:win     # → dist/my-db-system-<ver>-setup.exe  (Windows / NSIS)
npm run dist:linux   # → dist/my-db-system-<ver>.AppImage   (Linux)
npm run pack:dir     # 설치 파일 없이 빠른 실행 확인 → dist/*-unpacked
```

> 앱 아이콘은 [`build/`](build/README.md)에 `icon.ico`(Windows)·`icon.png`(Linux)를
> 넣으면 적용됩니다. 없으면 기본 Electron 아이콘이 쓰입니다.

### 릴리스 (배포)

네이티브 모듈 때문에 **각 OS에서 직접 빌드해 GitHub 릴리스에 올립니다.**

1. `package.json`의 `version`을 올립니다 (예: `0.1.0` → `0.1.1`)
2. GitHub 토큰(repo 권한)을 환경변수로 지정하고 빌드·업로드합니다:

```powershell
$env:GH_TOKEN = "ghp_xxx"   # Windows (PowerShell)
npm run release:win
```

```bash
export GH_TOKEN=ghp_xxx      # Linux
npm run release:linux
```

`release:*`는 설치 파일과 업데이트 메타데이터(`latest.yml`/`latest-linux.yml`)를
**초안(draft) 릴리스**로 올립니다. 내용 확인 후 GitHub에서 **Publish** 하면 사용자
다운로드·자동 업데이트에 노출됩니다.

> **토큰 없이 수동 업로드**: `npm run dist:win` / `dist:linux`로 빌드한 뒤, GitHub →
> **Releases → Draft a new release**에서 `dist/`의 설치 파일과 `latest*.yml`을 첨부해도 됩니다.

### 자동 업데이트 동작

- 설치된 앱은 `electron-updater`로 GitHub 릴리스에서 새 버전을 찾습니다.
- 설정창 → **업데이트 → 업데이트 확인**으로 수동 확인할 수 있고, 실행 후에도 한 번 자동 확인합니다.
- **Windows(NSIS)** 와 **Linux(AppImage)** 에서 동작하며, 개발 모드(`npm run dev`)에서는 비활성화됩니다.

### 기술 스택

Electron 33 · React 18 · TypeScript 5 · Vite (electron-vite) · better-sqlite3
그래프 뷰는 외부 라이브러리 없이 Canvas로 직접 구현한 force-directed 그래프입니다.

</details>

## 📜 License

[MIT](LICENSE) © devbin

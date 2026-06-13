# 빌드 리소스 (아이콘)

electron-builder의 `buildResources` 폴더입니다. 여기 있는 아이콘이 설치 파일과
실행 파일에 자동 적용됩니다.

| 파일 | 용도 |
|------|------|
| `icon.svg` | 원본 디자인 (4베이 NAS 정면) |
| `icon.png` | Linux 아이콘 (512×512) |
| `icon.ico` | Windows 아이콘 (16~256 멀티 해상도) |

## 아이콘 다시 만들기

`icon.svg`를 수정한 뒤 PNG·ICO를 다시 생성하려면:

```bash
npm install --no-save sharp png-to-ico
node build/gen-icons.mjs
```

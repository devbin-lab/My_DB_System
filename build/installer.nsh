; ─────────────────────────────────────────────────────────────
;  My DB System - NSIS 언인스톨 커스텀 스크립트
;  electron-builder가 build/installer.nsh 를 자동으로 포함한다.
; ─────────────────────────────────────────────────────────────

; 언인스톨 시: 설정·사용 기록(Electron userData)까지 완전히 삭제할지 묻는다.
;
;  - 설정/사용 기록은 %APPDATA%\my-db-system\config.json 등에 저장된다.
;    (테마, 저장소 위치, 초기 설정 마법사 완료 여부 onboarded 등)
;  - 이 폴더가 남아 있으면 재설치 시 초기 설정 마법사가 다시 뜨지 않고
;    기존 설정 그대로 실행된다.
;  - [예] 를 누르면 설정/사용 기록을 모두 지워, 다음 설치 때
;    초기 설정 마법사가 처음처럼 다시 표시된다.
;
;  ※ 사용자가 저장한 실제 파일/라이브러리 데이터(저장소 폴더)는
;     어느 경우든 삭제하지 않고 그대로 보존한다.
!macro customUnInstall
  ; 무인(silent) 제거 시에는 기본값(IDNO)으로 데이터를 보존한다.
  MessageBox MB_YESNO|MB_ICONQUESTION "설정과 사용 기록까지 완전히 삭제할까요?$\n$\n[예] 모든 설정·사용 기록을 삭제합니다.$\n      → 다음 설치 시 초기 설정 마법사가 처음처럼 다시 표시됩니다.$\n$\n[아니오] 설정을 그대로 둡니다(재설치 시 기존 설정이 유지됩니다).$\n$\n※ 직접 저장하신 파일/라이브러리 데이터는 어느 경우든 삭제되지 않습니다." /SD IDNO IDNO keepUserData
    ; 이름(package.json name) 기준 폴더와, productName 기준 폴더를 모두 정리한다.
    RMDir /r "$APPDATA\my-db-system"
    RMDir /r "$APPDATA\My DB System"
  keepUserData:
!macroend

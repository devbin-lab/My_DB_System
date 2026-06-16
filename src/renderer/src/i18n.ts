import { createContext, useContext } from 'react'

// ─────────────────────────────────────────────────────────────
//  다국어(i18n) 지원: 한국어 / 영어 / 일본어
//  - 언어는 settings.language 에 저장되며 DB(settingsStore)에 영속된다.
//  - App에서 makeT(lang)로 t 함수를 만들어 I18nContext로 내려준다.
//  - 컴포넌트에서는 useT()로 t 함수를 받아 t('key') 형태로 사용한다.
// ─────────────────────────────────────────────────────────────

export type Language = 'ko' | 'en' | 'ja'

// 언어 선택 UI에 표시할 목록(각 언어의 자국어 표기)
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' }
]

// 날짜 표기 등에 쓰는 Intl 로케일
export const LOCALES: Record<Language, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP'
}

type Dict = Record<string, string>

const ko: Dict = {
  // 공통
  'common.loading': '불러오는 중…',
  'common.cancel': '취소',
  'common.delete': '삭제',
  'common.confirm': '확인',
  'common.back': '이전',
  'common.next': '다음',

  // 상단 툴바
  'topbar.graph': '그래프',
  'topbar.list': '목록',
  'topbar.openFolder': '저장 폴더 열기',
  'topbar.settings': '설정',
  'topbar.addFile': '파일 추가',
  'topbar.trash': '휴지통',
  'trash.title': '휴지통',
  'trash.empty': '휴지통 비우기',
  'trash.restore': '복원',
  'trash.purge': '영구 삭제',
  'trash.isEmpty': '휴지통이 비어 있습니다',
  'trash.pivotsSection': '피벗',
  'trash.filesSection': '파일',
  'trash.emptyConfirm': '휴지통의 모든 항목을 영구 삭제할까요? 되돌릴 수 없습니다.',

  // 앱 본문
  'app.preview.readOnly': '읽기 전용',
  'app.preview.openInList': '목록에서 열기',
  'app.lib.searchPlaceholder': '이름 또는 태그 검색',
  'app.lib.emptyDrop': '파일을 창에 끌어다 놓거나\n상단의 [파일 추가]를 누르세요',
  'app.lib.noResults': '검색 결과가 없습니다',
  'app.lib.deleteTitle': '삭제',
  'app.lib.selectToView': '파일을 선택하면 여기에 표시됩니다',
  'app.lib.filterAll': '전체',
  'app.lib.sortLabel': '정렬',
  'app.lib.sort.recent': '최근순',
  'app.lib.sort.name': '이름순',
  'app.lib.sort.size': '크기순',
  'type.md': '마크다운',
  'type.pdf': 'PDF',
  'type.csv': 'CSV',
  'type.code': '코드',
  'type.image': '이미지',
  'type.ppt': 'PPT',
  'type.xls': '엑셀',
  'type.other': '기타',
  'app.storage.moveFailed':
    '저장소 이동에 실패했습니다. 폴더 권한이나 사용 중인 파일을 확인해주세요.',
  'app.drop.here': '여기에 파일을 놓으세요',
  'app.drop.linkHint': '현재 피벗에 자동으로 연결됩니다',
  'app.pivot.new': '새 피벗',

  // 온보딩(첫 실행 마법사)
  'onboard.steps.language': '언어',
  'onboard.steps.welcome': '환영',
  'onboard.steps.appearance': '모양',
  'onboard.steps.storage': '저장 위치',
  'onboard.steps.graph': '그래프',
  'onboard.welcome.title': 'My DB System에 오신 걸 환영합니다',
  'onboard.welcome.desc':
    '파일·프로젝트·갤러리를 한곳에 모으고 그래프로 연결하는\n나만의 데이터 저장 시스템입니다. 시작 전에 몇 가지만 설정할게요.',
  'onboard.changeAnytime': '언제든 설정에서 다시 바꿀 수 있어요.',
  'onboard.language.title': '언어 선택',
  'onboard.language.desc': '앱에서 사용할 언어를 선택하세요. 나중에 설정에서 바꿀 수 있어요.',
  'onboard.appearance.title': '모양 고르기',
  'onboard.appearance.theme': '테마',
  'onboard.appearance.accent': '포인트 색상',
  'onboard.storage.title': '데이터 저장 위치',
  'onboard.storage.desc':
    '추가하는 모든 파일이 이 폴더로 복사되어 보관됩니다. 클라우드 동기화 폴더(예: 드롭박스)를 골라도 됩니다. 나중에 옮기면 데이터도 함께 이동해요.',
  'onboard.storage.change': '폴더 변경',
  'onboard.graph.title': '그래프 검색 개수',
  'onboard.graph.desc':
    '그래프 화면에서 우클릭 검색 시 한 번에 보여줄 결과 수입니다. 12개마다 바깥쪽 시계 링이 하나씩 늘어납니다.',
  'onboard.graph.count': '검색 결과 표시 개수',
  'onboard.start': '시작하기',

  // 설정
  'settings.title': '설정',
  'settings.language.title': '언어',
  'settings.theme': '테마',
  'settings.accent': '포인트 색상',
  'settings.storage.title': '저장소',
  'settings.storage.desc':
    '추가하는 모든 파일이 이 폴더로 복사되어 보관됩니다. 위치를 바꾸면 기존 데이터도 함께 옮겨집니다.',
  'settings.storage.change': '폴더 변경',
  'settings.storage.open': '탐색기에서 열기',
  'settings.graph.title': '그래프 검색',
  'settings.graph.count': '검색 결과 표시 개수',
  'settings.graph.countHint': '12개마다 바깥쪽 시계 링이 하나씩 늘어납니다',
  'settings.update.title': '업데이트',
  'settings.update.current': '현재 버전',
  'settings.update.check': '업데이트 확인',
  'settings.update.checking': '확인 중…',
  'settings.update.install': '재시작하여 설치',
  'settings.update.msg.checking': '업데이트 확인 중…',
  'settings.update.msg.available': '새 버전 v{version} 을(를) 내려받는 중…',
  'settings.update.msg.downloading': '새 버전 v{version} 내려받는 중… {percent}%',
  'settings.update.msg.downloaded': 'v{version} 설치 준비 완료. 재시작하면 적용됩니다.',
  'settings.update.msg.notAvailable': '최신 버전을 사용 중입니다.',
  'settings.update.msg.dev': '개발 모드에서는 업데이트를 확인할 수 없습니다.',
  'settings.update.msg.error': '업데이트 확인 실패: {error}',
  'settings.update.unknownError': '알 수 없는 오류',

  // 테마
  'theme.slate.name': '슬레이트',
  'theme.slate.desc': '밝은 다크',
  'theme.light.name': '라이트',
  'theme.light.desc': '밝고 깔끔한',
  'theme.navy.name': '네이비',
  'theme.navy.desc': '깊은 청색 다크',

  // 포인트 색상
  'accent.teal': '틸',
  'accent.blue': '블루',
  'accent.violet': '바이올렛',
  'accent.amber': '앰버',
  'accent.green': '그린',

  // 뷰어
  'viewer.openExternal': '외부에서 열기',
  'viewer.showInFolder': '폴더에서 보기',
  'viewer.tagsPlaceholder': '태그 (쉼표로 구분)',
  'viewer.suggestedTags': '기존 태그',
  'viewer.noPreview': '이 형식은 미리보기를 지원하지 않습니다.',
  'viewer.emptyCsv': '빈 CSV 파일입니다.',
  'viewer.csvNote': '처음 1,000행만 표시됩니다.',

  // 그래프
  'graph.all': '전체',
  'graph.pivotHint': '이 화면에서 추가한 파일은 이 피벗에 연결됩니다',
  'graph.linkPromptSuffix': ' 와(과) 연결할 대상을 클릭하거나 검색하세요',
  'graph.linkSearchPlaceholder': '피벗 / 파일 이름 검색…',
  'graph.noLinkTargets': '연결할 대상이 없습니다',
  'graph.pivotNamePlaceholder': '피벗 이름 입력',
  'graph.searchPlaceholder': '검색',
  'graph.noResults': '검색 결과 없음',
  'graph.createPivot': '새 피벗 생성',
  'graph.rename': '이름변경',
  'graph.connect': '연결',
  'graph.disconnect': '연결취소',
  'graph.delete': '삭제',
  'graph.noConnected': '연결된 대상이 없습니다',
  'graph.emptyPivot': '이 피벗에 연결된 파일이 없습니다.',
  'graph.empty': '비어 있습니다.',
  'graph.emptyHint': '빈 곳을 우클릭해 피벗을 만들거나, 파일을 추가하세요.',
  'graph.legend': '클릭=열기/피벗진입 · 우클릭(빈곳)=검색·피벗생성 · 우클릭(노드)=메뉴'
}

const en: Dict = {
  // common
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.confirm': 'OK',
  'common.back': 'Back',
  'common.next': 'Next',

  // top toolbar
  'topbar.graph': 'Graph',
  'topbar.list': 'List',
  'topbar.openFolder': 'Open storage folder',
  'topbar.settings': 'Settings',
  'topbar.addFile': 'Add files',
  'topbar.trash': 'Trash',
  'trash.title': 'Trash',
  'trash.empty': 'Empty trash',
  'trash.restore': 'Restore',
  'trash.purge': 'Delete forever',
  'trash.isEmpty': 'Trash is empty',
  'trash.pivotsSection': 'Pivots',
  'trash.filesSection': 'Files',
  'trash.emptyConfirm': 'Permanently delete everything in the trash? This cannot be undone.',

  // app body
  'app.preview.readOnly': 'Read-only',
  'app.preview.openInList': 'Open in list',
  'app.lib.searchPlaceholder': 'Search by name or tag',
  'app.lib.emptyDrop': 'Drag files into the window\nor click [Add files] above',
  'app.lib.noResults': 'No results found',
  'app.lib.deleteTitle': 'Delete',
  'app.lib.selectToView': 'Select a file to view it here',
  'app.lib.filterAll': 'All',
  'app.lib.sortLabel': 'Sort',
  'app.lib.sort.recent': 'Recent',
  'app.lib.sort.name': 'Name',
  'app.lib.sort.size': 'Size',
  'type.md': 'Markdown',
  'type.pdf': 'PDF',
  'type.csv': 'CSV',
  'type.code': 'Code',
  'type.image': 'Image',
  'type.ppt': 'PPT',
  'type.xls': 'Excel',
  'type.other': 'Other',
  'app.storage.moveFailed':
    'Failed to move storage. Check folder permissions or files currently in use.',
  'app.drop.here': 'Drop files here',
  'app.drop.linkHint': 'Will be linked to the current pivot',
  'app.pivot.new': 'New pivot',

  // onboarding
  'onboard.steps.language': 'Language',
  'onboard.steps.welcome': 'Welcome',
  'onboard.steps.appearance': 'Appearance',
  'onboard.steps.storage': 'Storage',
  'onboard.steps.graph': 'Graph',
  'onboard.welcome.title': 'Welcome to My DB System',
  'onboard.welcome.desc':
    'Your personal data system that gathers files, projects, and galleries\nin one place and connects them as a graph. Let’s set up a few things first.',
  'onboard.changeAnytime': 'You can change this anytime in Settings.',
  'onboard.language.title': 'Choose a language',
  'onboard.language.desc':
    'Select the language for the app. You can change it later in Settings.',
  'onboard.appearance.title': 'Choose the look',
  'onboard.appearance.theme': 'Theme',
  'onboard.appearance.accent': 'Accent color',
  'onboard.storage.title': 'Data storage location',
  'onboard.storage.desc':
    'Every file you add is copied into this folder. You can pick a cloud-synced folder (e.g. Dropbox). If you move it later, your data moves with it.',
  'onboard.storage.change': 'Change folder',
  'onboard.graph.title': 'Graph search count',
  'onboard.graph.desc':
    'How many results to show at once when right-click searching in the graph. A new outer clock ring is added every 12 results.',
  'onboard.graph.count': 'Results to display',
  'onboard.start': 'Get started',

  // settings
  'settings.title': 'Settings',
  'settings.language.title': 'Language',
  'settings.theme': 'Theme',
  'settings.accent': 'Accent color',
  'settings.storage.title': 'Storage',
  'settings.storage.desc':
    'Every file you add is copied into this folder. Changing the location moves your existing data too.',
  'settings.storage.change': 'Change folder',
  'settings.storage.open': 'Open in file explorer',
  'settings.graph.title': 'Graph search',
  'settings.graph.count': 'Results to display',
  'settings.graph.countHint': 'A new outer clock ring is added every 12 results',
  'settings.update.title': 'Updates',
  'settings.update.current': 'Current version',
  'settings.update.check': 'Check for updates',
  'settings.update.checking': 'Checking…',
  'settings.update.install': 'Restart to install',
  'settings.update.msg.checking': 'Checking for updates…',
  'settings.update.msg.available': 'Downloading new version v{version}…',
  'settings.update.msg.downloading': 'Downloading new version v{version}… {percent}%',
  'settings.update.msg.downloaded': 'v{version} ready to install. It applies on restart.',
  'settings.update.msg.notAvailable': 'You are on the latest version.',
  'settings.update.msg.dev': 'Updates cannot be checked in development mode.',
  'settings.update.msg.error': 'Update check failed: {error}',
  'settings.update.unknownError': 'Unknown error',

  // themes
  'theme.slate.name': 'Slate',
  'theme.slate.desc': 'Bright dark',
  'theme.light.name': 'Light',
  'theme.light.desc': 'Clean and bright',
  'theme.navy.name': 'Navy',
  'theme.navy.desc': 'Deep blue dark',

  // accents
  'accent.teal': 'Teal',
  'accent.blue': 'Blue',
  'accent.violet': 'Violet',
  'accent.amber': 'Amber',
  'accent.green': 'Green',

  // viewer
  'viewer.openExternal': 'Open externally',
  'viewer.showInFolder': 'Show in folder',
  'viewer.tagsPlaceholder': 'Tags (comma separated)',
  'viewer.suggestedTags': 'Existing tags',
  'viewer.noPreview': 'Preview is not available for this file type.',
  'viewer.emptyCsv': 'This CSV file is empty.',
  'viewer.csvNote': 'Showing the first 1,000 rows only.',

  // graph
  'graph.all': 'All',
  'graph.pivotHint': 'Files added on this screen are linked to this pivot',
  'graph.linkPromptSuffix': ' — click or search for a target to link',
  'graph.linkSearchPlaceholder': 'Search pivot / file name…',
  'graph.noLinkTargets': 'No targets to link',
  'graph.pivotNamePlaceholder': 'Enter pivot name',
  'graph.searchPlaceholder': 'Search',
  'graph.noResults': 'No results',
  'graph.createPivot': 'Create new pivot',
  'graph.rename': 'Rename',
  'graph.connect': 'Connect',
  'graph.disconnect': 'Disconnect',
  'graph.delete': 'Delete',
  'graph.noConnected': 'No connected targets',
  'graph.emptyPivot': 'No files are linked to this pivot.',
  'graph.empty': 'Nothing here yet.',
  'graph.emptyHint': 'Right-click empty space to create a pivot, or add files.',
  'graph.legend':
    'Click = open/enter pivot · Right-click (empty) = search/new pivot · Right-click (node) = menu'
}

const ja: Dict = {
  // 共通
  'common.loading': '読み込み中…',
  'common.cancel': 'キャンセル',
  'common.delete': '削除',
  'common.confirm': 'OK',
  'common.back': '戻る',
  'common.next': '次へ',

  // 上部ツールバー
  'topbar.graph': 'グラフ',
  'topbar.list': 'リスト',
  'topbar.openFolder': '保存フォルダを開く',
  'topbar.settings': '設定',
  'topbar.addFile': 'ファイル追加',
  'topbar.trash': 'ゴミ箱',
  'trash.title': 'ゴミ箱',
  'trash.empty': 'ゴミ箱を空にする',
  'trash.restore': '復元',
  'trash.purge': '完全に削除',
  'trash.isEmpty': 'ゴミ箱は空です',
  'trash.pivotsSection': 'ピボット',
  'trash.filesSection': 'ファイル',
  'trash.emptyConfirm': 'ゴミ箱のすべての項目を完全に削除しますか？元に戻せません。',

  // アプリ本文
  'app.preview.readOnly': '読み取り専用',
  'app.preview.openInList': 'リストで開く',
  'app.lib.searchPlaceholder': '名前またはタグで検索',
  'app.lib.emptyDrop': 'ファイルをウィンドウにドラッグするか\n上部の[ファイル追加]を押してください',
  'app.lib.noResults': '検索結果がありません',
  'app.lib.deleteTitle': '削除',
  'app.lib.selectToView': 'ファイルを選択するとここに表示されます',
  'app.lib.filterAll': '全て',
  'app.lib.sortLabel': '並び替え',
  'app.lib.sort.recent': '最近順',
  'app.lib.sort.name': '名前順',
  'app.lib.sort.size': 'サイズ順',
  'type.md': 'Markdown',
  'type.pdf': 'PDF',
  'type.csv': 'CSV',
  'type.code': 'コード',
  'type.image': '画像',
  'type.ppt': 'PPT',
  'type.xls': 'Excel',
  'type.other': 'その他',
  'app.storage.moveFailed':
    'ストレージの移動に失敗しました。フォルダの権限や使用中のファイルを確認してください。',
  'app.drop.here': 'ここにファイルをドロップ',
  'app.drop.linkHint': '現在のピボットに自動的にリンクされます',
  'app.pivot.new': '新しいピボット',

  // オンボーディング
  'onboard.steps.language': '言語',
  'onboard.steps.welcome': 'ようこそ',
  'onboard.steps.appearance': '外観',
  'onboard.steps.storage': '保存場所',
  'onboard.steps.graph': 'グラフ',
  'onboard.welcome.title': 'My DB System へようこそ',
  'onboard.welcome.desc':
    'ファイル・プロジェクト・ギャラリーを一か所に集め、グラフでつなぐ\nあなただけのデータ保存システムです。始める前にいくつか設定しましょう。',
  'onboard.changeAnytime': '設定からいつでも変更できます。',
  'onboard.language.title': '言語の選択',
  'onboard.language.desc': 'アプリで使用する言語を選択してください。後で設定から変更できます。',
  'onboard.appearance.title': '外観を選ぶ',
  'onboard.appearance.theme': 'テーマ',
  'onboard.appearance.accent': 'アクセントカラー',
  'onboard.storage.title': 'データの保存場所',
  'onboard.storage.desc':
    '追加したすべてのファイルはこのフォルダにコピーされて保管されます。クラウド同期フォルダ（例：Dropbox）を選んでも構いません。後で移動するとデータも一緒に移動します。',
  'onboard.storage.change': 'フォルダを変更',
  'onboard.graph.title': 'グラフ検索の表示数',
  'onboard.graph.desc':
    'グラフ画面で右クリック検索したときに一度に表示する結果数です。12件ごとに外側の時計リングが1つずつ増えます。',
  'onboard.graph.count': '表示する結果数',
  'onboard.start': '始める',

  // 設定
  'settings.title': '設定',
  'settings.language.title': '言語',
  'settings.theme': 'テーマ',
  'settings.accent': 'アクセントカラー',
  'settings.storage.title': 'ストレージ',
  'settings.storage.desc':
    '追加したすべてのファイルはこのフォルダにコピーされて保管されます。場所を変更すると既存のデータも一緒に移動します。',
  'settings.storage.change': 'フォルダを変更',
  'settings.storage.open': 'エクスプローラーで開く',
  'settings.graph.title': 'グラフ検索',
  'settings.graph.count': '表示する結果数',
  'settings.graph.countHint': '12件ごとに外側の時計リングが1つずつ増えます',
  'settings.update.title': 'アップデート',
  'settings.update.current': '現在のバージョン',
  'settings.update.check': 'アップデートを確認',
  'settings.update.checking': '確認中…',
  'settings.update.install': '再起動してインストール',
  'settings.update.msg.checking': 'アップデートを確認中…',
  'settings.update.msg.available': '新しいバージョン v{version} をダウンロード中…',
  'settings.update.msg.downloading': '新しいバージョン v{version} をダウンロード中… {percent}%',
  'settings.update.msg.downloaded': 'v{version} のインストール準備完了。再起動すると適用されます。',
  'settings.update.msg.notAvailable': '最新バージョンを使用中です。',
  'settings.update.msg.dev': '開発モードではアップデートを確認できません。',
  'settings.update.msg.error': 'アップデート確認に失敗しました: {error}',
  'settings.update.unknownError': '不明なエラー',

  // テーマ
  'theme.slate.name': 'スレート',
  'theme.slate.desc': '明るいダーク',
  'theme.light.name': 'ライト',
  'theme.light.desc': '明るく清潔',
  'theme.navy.name': 'ネイビー',
  'theme.navy.desc': '深い青のダーク',

  // アクセントカラー
  'accent.teal': 'ティール',
  'accent.blue': 'ブルー',
  'accent.violet': 'バイオレット',
  'accent.amber': 'アンバー',
  'accent.green': 'グリーン',

  // ビューア
  'viewer.openExternal': '外部で開く',
  'viewer.showInFolder': 'フォルダで表示',
  'viewer.tagsPlaceholder': 'タグ（カンマ区切り）',
  'viewer.suggestedTags': '既存のタグ',
  'viewer.noPreview': 'この形式はプレビューに対応していません。',
  'viewer.emptyCsv': '空のCSVファイルです。',
  'viewer.csvNote': '最初の1,000行のみ表示しています。',

  // グラフ
  'graph.all': '全体',
  'graph.pivotHint': 'この画面で追加したファイルはこのピボットにリンクされます',
  'graph.linkPromptSuffix': ' とリンクする対象をクリックまたは検索してください',
  'graph.linkSearchPlaceholder': 'ピボット / ファイル名で検索…',
  'graph.noLinkTargets': 'リンクできる対象がありません',
  'graph.pivotNamePlaceholder': 'ピボット名を入力',
  'graph.searchPlaceholder': '検索',
  'graph.noResults': '検索結果なし',
  'graph.createPivot': '新しいピボットを作成',
  'graph.rename': '名前変更',
  'graph.connect': 'リンク',
  'graph.disconnect': 'リンク解除',
  'graph.delete': '削除',
  'graph.noConnected': 'リンクされた対象がありません',
  'graph.emptyPivot': 'このピボットにリンクされたファイルはありません。',
  'graph.empty': '何もありません。',
  'graph.emptyHint': '空いている場所を右クリックしてピボットを作成するか、ファイルを追加してください。',
  'graph.legend':
    'クリック=開く/ピボット移動 · 右クリック(空白)=検索・ピボット作成 · 右クリック(ノード)=メニュー'
}

const translations: Record<Language, Dict> = { ko, en, ja }

export type TFunc = (key: string, vars?: Record<string, string | number>) => string

// 주어진 언어의 번역 함수를 만든다. 키가 없으면 영어 → 키 자체 순으로 폴백.
export function makeT(lang: Language): TFunc {
  const dict = translations[lang] ?? translations.en
  return (key, vars) => {
    let s = dict[key] ?? translations.en[key] ?? key
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]))
      }
    }
    return s
  }
}

export const I18nContext = createContext<TFunc>(makeT('en'))
export const useT = (): TFunc => useContext(I18nContext)

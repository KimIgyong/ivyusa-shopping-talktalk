# FIX-260828-Widget-AppMode-Defects

Android SDK 실기기 검증(TCR-260828)이 드러낸 위젯 측 결함 5건의 근본 원인과 수정.
전부 **기존 코드의 결함**이며(SDK가 만든 게 아니라 SDK가 처음 밟은 경로), ④는 웹 임베드에도
영향, ①~③은 RN·iOS 등 모든 네이티브 호스트에 공통이다.

- 발견 경위: PLN-260827 W3 — SM-G991N 실기기 + 로컬 위젯 + 스테이징 API
- 수정 파일: `useEmbedCommands.ts` · `host-bridge.ts` · `useAttachmentUpload.ts` · `WidgetPanel.tsx`

## ① locale 명령이 UI 언어를 바꾸지 않음

- **증상**: `ShopTalkConfig(locale="vi")`로 열어도 UI가 KO(기기 언어) — 가이드의
  "`action:'locale'` = 언어 변경" 약속과 불일치.
- **선행 발견**: 가이드·RN 참조가 쓰던 **`locale` URL 파라미터는 위젯이 아예 읽지 않는
  죽은 파라미터**였다(i18n은 수동 선택→브라우저 언어→en). 가이드 §1 정정, SDK는 브리지
  명령으로 전달하게 구현.
- **원인**: `case 'locale'`이 `store.setLanguage`만 호출 — 세션(AI 응답) 언어만 바뀌고
  i18n UI는 그대로.
- **수정**: 위젯 내 언어 스위처(`LanguageSwitcher.changeTo`)와 동일 동작으로 통일 —
  `i18n.changeLanguage` + `document.lang` + `ivy_lang` 저장(세션 ensure 동기화가 서버
  언어로 되돌리지 않도록) + 서버 세션 언어 PATCH. 지원 목록 밖 코드는 무시.

## ② 세션 생성 전 도착한 identify/locale이 조용히 유실

- **증상**: 앱이 `ivy:ready` 직후 identify를 보내도 `identified` 이벤트가 영영 안 옴.
- **원인**: `ivy:identify` 처리기가 `if (!token) return` — 주석은 "세션을 기다린다"고
  했지만 실제로는 **버리고** 있었다. 앱 모드에서는 ready가 세션 ensure 응답보다 항상
  빠르므로 이것이 **주 경로**다. locale의 서버 PATCH도 동일.
- **수정**: 마지막 identify/locale을 파킹하고 스토어 구독으로 **토큰 랜딩 시 재생**.
- **예방 패턴**: "기다린다"는 주석과 `return`은 양립하지 않는다 — 대기는 큐·구독 같은
  실재하는 장치로만 성립한다.

## ③ 브리지 사전 큐가 첫 구독자에게만 방출

- **증상**: ② 수정 후에도 마운트 전에 보낸 identify가 명령 훅에 안 닿음.
- **원인**: `host-bridge`의 pre-mount 큐가 **최초 `onHostMessage` 구독 시점에 그
  구독자에게만** 동기 방출 — identity 훅(무시하는 쪽)이 먼저 구독하면 명령 훅은 못 본다.
- **수정**: 방출을 **다음 틱으로 미루고 그 시점의 전체 구독자에게** 배달(같은 커밋의 훅들이
  모두 구독을 마친 뒤). 계약 테스트 갱신 + 이중 구독자 회귀 테스트 추가(24/24).

## ④ 첨부 업로드가 조건부로 0건 (웹 포함 전 채널)

- **증상**: 파일 선택 → 칩은 뜨는데 진행 0%에서 영원히 멈춤. 에러 없음, 네트워크 요청
  **0건**(nginx 무기록). 데스크톱 Chrome에서도 동일 재현 — WebView 무관.
- **원인**: `useAttachmentUpload.add`가 **setState updater 안에서 `accepted` 배열을
  채우는 불순 updater**. React 18은 업데이트 큐가 빌 때만 updater를 즉시(eager) 실행하므로,
  다른 업데이트가 걸려 있으면 렌더 시점으로 미뤄져 `accepted`가 빈 채로
  `Promise.all([])`이 돌았다. **8/14 스테이징 스모크는 eager 경로라 통과** — 재현이
  타이밍 의존이라 지금까지 숨어 있었다.
- **수정**: `pendingRef` 동기 미러 + `apply()` 경유로 모든 변이를 일원화 — 판단은 ref에서
  동기적으로, React에는 순수 값만 전달. 수정 후 데스크톱·실기기 모두 업로드 201·발송·AI
  수신 확인.
- **예방 패턴 (일반화)**: **setState updater 안에서 바깥 변수를 채우지 말 것.** updater는
  React가 언제·몇 번 부를지 보장하지 않는다(eager 최적화·StrictMode 이중 호출·렌더 지연).
  updater 밖에서 계산하고 updater는 순수 append/map만.

## ⑤ 앱 모드 광폭 뷰포트에서 패널이 화면을 안 채움

- **증상**: 실기기 가로 회전 시 채팅이 우측 반쪽에 붙고 좌측은 공백.
- **원인**: 패널의 `sm:`(≥640px) 클래스가 **웹 임베드용 플로팅 카드**(404px 우하단 앵커)로
  전환 — 앱 모드는 호스트 앱이 화면 전체를 내줬는데도 그 규칙을 그대로 탔다.
- **수정**: `isAppMode()`면 `sm:` 플로팅 카드 클래스를 제외하고 항상 전체 화면.

## 검증

- 위젯 스위트 24/24(신규 1 포함) · 모노레포 typecheck 9/9 · 전체 테스트 6/6 태스크
- 실기기 재검증: TCR-260828 §2 (locale VI 전면 적용·identify 왕복·첨부 201·가로 전폭)
- ⚠️ 이 수정들은 **스테이징 미배포** — 배포 전까지 스테이징 위젯은 ①~⑤를 그대로 갖고 있다
  (④는 웹 고객에도 영향). 배포 판단은 RPT/PR에서.

# TCR-260828-Kotlin-Android-SDK

Kotlin Android SDK(AAR) 검증 기록. `PLN-260827-Kotlin-Android-SDK.md` §7의 계획 대비 실측.

- 검증일: 2026-08-28
- 실기기: **Samsung SM-G991N (Galaxy S21, Android 15 / API 35)** — targetSdk 35 엣지투엣지 실환경
- 위젯: 로컬 dev(127.0.0.1:5199, `adb reverse`) + **스테이징 API**(shoptalk.amoeba.site) 조합
  — 위젯 수정분(FIX-260828)을 배포 전에 실기기로 검증하기 위한 구성. 스테이징 위젯 원본
  대상 재검증은 배포 후 필요(§4)
- 테넌트: **go2joy**(스테이징 실데이터, `shop=https://www.go2joy.vn`)

## 1. JVM 단위 테스트 — 13/13 통과

| 그룹 | 케이스 |
|---|---|
| ShopTalkConfig (5) | 최소 구성 URL(`embed=1&mode=app`) · 전체 파라미터+인코딩 · **locale은 URL에 절대 안 감**(위젯이 안 읽음) · 빈 옵션 생략 · 위젯/외부 URL 판별(`about:blank`·`mailto:` 포함) |
| ShopTalkProtocol (8) | identify 필드·옵션 생략 · open/locale/logout 명령 형식 · locale 정규화(`vi-VN`→`vi`) · **주입 이스케이프**(따옴표·개행이 JS 문자열을 못 깨뜨림) · 수신 4종 파싱 · **미지 타입 관용+비JSON 무시** · **리스너 예외 격리** · 이벤트별 라우팅 |

## 2. 실기기 검증 — PLN §7 ①~⑧

| # | 항목 | 결과 |
|---|---|---|
| ① | `ivy:ready` → identify 자동 전송 → `identified` 이벤트 | ✅ 마운트 전 identify가 SDK 큐→위젯 파킹→토큰 랜딩 재생→API 검증→`ok=false` 수신(시크릿 미발급 테넌트의 기대값 — **거부돼도 게스트 대화 지속** 확인). `ok=true`는 W5에서 시크릿 발급 후 |
| ② | X 클릭 → `onCloseRequest` | ✅ `close-request → finishing` 로그, 액티비티 종료, 빈 화면 없음 |
| ③ | 사진 첨부 갤러리 왕복 | ✅ 시스템 선택기 오픈→취소 경로(재오픈 정상)→이미지 선택→**업로드 POST 201**→발송→AI "파일 받았습니다" 응답. 단 **위젯 업로드 훅 결함(FIX-260828 ④) 수정 후에야 통과** |
| ④ | 외부 링크 → 시스템 브라우저 | ⚠️ 코드 경로는 단위 검증(`isWidgetUrl`), 실기기에서는 대화 내 외부 링크 소재가 없어 육안 미실시 — W5 온보딩 시 확인 |
| ⑤ | 키보드 위 입력창 노출 | ✅ 키보드 열린 상태 캡처로 확인(adjustResize+IME 인셋) |
| ⑥ | 앱 재실행 후 세션 유지 | ✅ force-stop→재실행: 같은 대화 이력·타임스탬프 유지(localStorage/domStorage) |
| ⑦ | 회전·백그라운드 복귀 | ✅ 가로 회전 후 대화·스테이징된 첨부 유지. 가로 레이아웃 결함(우측 반쪽 패널)은 위젯 CSS 문제로 판명·수정(FIX-260828 ⑤) 후 전체 폭 확인 |
| ⑧ | 서명 불일치 → 게스트 지속 | ✅ ①과 동일 실행에서 확인(가짜 hash로 `ok=false` 후 대화 계속) |

추가 확인: go2joy 브랜딩(로고·오렌지 테마)·에이전트 인사말(호텔 도메인)·**locale 명령으로 UI
전면 베트남어**(FIX-260828 ①·② 수정 후)·AI 실응답(체크인 시간 질의) — 전부 실기기에서 육안.

## 3. 검증이 잡은 결함 (전부 위젯 측, 수정 완료)

상세는 `FIX-260828-Widget-AppMode-Defects.md`. 요약: ① locale 명령이 UI 언어를 안 바꿈
② 세션 생성 전 identify/locale 조용히 유실 ③ 브리지 사전 큐가 첫 구독자에게만 방출
④ **첨부 업로드가 불순 updater 때문에 조건부로 0건**(웹에도 영향) ⑤ 앱 모드 광폭
뷰포트에서 패널이 화면을 안 채움.

## 4. 미검증 잔여

- `identified ok=true`(실제 서명) — 스테이징에 embed_secret 보유 테넌트 0 → W5에서
- 외부 링크 실기기 육안(②의 ④)
- **스테이징 배포 후 스테이징 위젯 원본 대상 재검증** — 이번 검증은 로컬 위젯+스테이징 API
- minSdk 24 하단(API 24 에뮬레이터) — 상단(35)만 실기기 검증됨

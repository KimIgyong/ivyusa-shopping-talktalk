# REQ-260827-Kotlin-Android-SDK

go2joy 코틀린(안드로이드 네이티브) 앱에 ShopTalk 상담 화면을 제공하기 위한 Kotlin SDK 준비 — 현황 조사·격차 분석·작업 방안.

- 작성일: 2026-08-27
- 요청: "코틀린으로 개발된 모바일앱 go2joy에 샵톡을 제공해야 한다. 코틀린 모바일앱용 SDK 준비와 어떻게 작업하는 게 좋을지 조사하여 보고하라"
- 선행 문서: `REQ-260819-Widget-Theming-Embed-SDK.md`(FR-S6) → `PLN-260820-Mobile-SDK`(승인) → `RPT-260820-Mobile-SDK.md`(PR #327, main `bc92ca9`, 스테이징 배포됨)

## 1. AS-IS — 이미 있는 것

모바일 연동의 **토대는 8/20에 이미 배포되어 있다.** 방식은 WebView 래퍼: 웹과 같은 위젯을
앱 안에 띄우고, 앱과 위젯이 소수의 메시지만 주고받는다. 채팅 UI를 네이티브로 재작성하지
않으므로 웹 수정이 앱에 그대로 반영된다.

| 산출물 | 상태 |
|---|---|
| `apps/widget/src/lib/host-bridge.ts` | 호스트 채널 추상화 — **Android 채널 이미 존재** (`window.ShopTalkAndroid.postMessage`, 수신 전역 `window.__shoptalkHost`, 마운트 전 메시지 큐 20건) |
| `?mode=app` | 런처 없음 · 패널 열린 채 시작 · 닫기(X)는 `ivy:close-request`로 호스트에 위임 |
| 브리지 계약 | 앱→위젯: `ivy:identify` / `ivy:command`(open·locale·logout) · 위젯→앱: `ivy:ready` / `ivy:close-request` / `ivy:event`(identified) — 4개 플랫폼(frame/RN/iOS/Android) 동일 형태 |
| `packages/shoptalk-rn` | **RN 참조 구현**(~170줄): 신원 주입, close 콜백, 파일 접근, 외부 링크 시스템 브라우저, 키보드 회피, 로딩 표시. 발행 안 함 |
| `docs/guide/모바일SDK연동가이드_Mobile-SDK.ko.md` | 계약 명세 + **Kotlin 스니펫**(JS 인터페이스·send·onShowFileChooser) + 체크리스트 7항 |
| `apps/widget/public/webview-test.html` | 네이티브 호스트 시뮬레이터(실기기 대체 아님) |
| 신원 연동 | 웹 임베드 SDK와 동일 — `hash = HMAC_SHA256(embed_secret, userId)`를 **고객사 서버에서 서명**. 서명 실패해도 게스트로 대화 지속 |
| 위젯 URL 파라미터 | `shop`(테넌트 식별) · `locale` · `agent`(AI 에이전트 코드 — go2joy는 4종 등록됨, PR #329) |

즉 "Kotlin에서 붙는가"는 이미 답이 있다 — 가이드 §6 스니펫 30여 줄이면 붙는다.

## 2. 격차 — 무엇이 없는가

RPT-260820이 정직하게 남긴 잔여가 곧 이번 요구의 격차다.

| ID | 격차 | 결과 |
|---|---|---|
| G-1 | **배포 가능한 Kotlin 라이브러리(AAR)가 없다.** 스니펫은 문서일 뿐 — go2joy 개발자가 브리지·파일선택기·링크 처리를 직접 조립·유지보수해야 한다 | 통합 품질이 고객사 구현에 좌우됨. 계약이 바뀌면 문서로만 전파 |
| G-2 | **Android 파일 선택기**(`onShowFileChooser`) 미구현 시 사진 첨부가 **조용히 실패** (RPT R-2) | 위젯 버그처럼 보이는 CS 유입 |
| G-3 | 키보드 회피·외부 링크·DOM storage 등 체크리스트 7항이 전부 고객사 책임 (RPT R-3) | 항목 하나 빠질 때마다 증상이 다르게 나타남(세션 끊김·입력창 가림·복귀 불가) |
| G-4 | **실기기·실앱 검증 0건** (RPT R-1). 시뮬레이터는 계약만 확인 | 파일선택·키보드·링크는 기기에서만 검증됨 |
| G-5 | go2joy 온보딩 미완: embed secret 발급, 서버 서명 엔드포인트(go2joy 백엔드), `shop`/`agent` 값 확정, 대상 환경(스테이징/운영) | SDK가 있어도 신원 연동이 안 됨 |
| G-6 | **새 메시지 푸시 알림 없음** — WebView는 화면이 떠 있을 때만 산다. 백그라운드 수신은 FCM+서버 발송이 별도로 필요 | 상담원 답변을 고객이 놓침 (범위 판단 필요) |

## 3. TO-BE — 선택지 3안

### A안 (권장): Kotlin 래퍼 라이브러리 `shoptalk-android` (AAR)
RN 참조 구현과 동일한 철학의 **얇은 네이티브 래퍼**. WebView가 공짜로 해주지 않는 것만 책임진다:

```kotlin
// go2joy 쪽 통합 코드 — 이 정도가 전부가 되게 한다
val chat = ShopTalkChatFragment.newInstance(
    ShopTalkConfig(
        widgetUrl = "https://shoptalk.amoeba.site/widget/",
        shop = "<go2joy shop 값>",
        locale = "vi",
        agent = "<에이전트 코드, 선택>",
    )
)
chat.identify(ShopTalkUser(userId = uid, hash = serverSignedHash))
chat.onCloseRequest = { supportFragmentManager.popBackStack() }
```

내부 구현(전부 기존 계약 위):
- WebView 구성: JS·DOM storage 활성, `mode=app` URL 조립, 로딩 인디케이터
- `ShopTalkAndroid` JS 인터페이스 수신 + `__shoptalkHost` evaluateJavascript 송신(JSONObject.quote 이스케이프)
- `onShowFileChooser` → ActivityResult API 파일/사진 선택 (G-2)
- 외부 링크 `shouldOverrideUrlLoading` → Custom Tabs/시스템 브라우저 (G-3)
- 키보드: `adjustResize` + WindowInsets 처리 (G-3)
- `ivy:ready`에서 identify 재전송, `ivy:event(identified)` 콜백

규모는 RN 참조와 유사한 **파일 4~6개, 수백 줄** 수준. 계약·위젯·서버는 **무수정**.

### B안: 문서·스니펫 제공으로 종결 (현상 유지)
가이드 §6을 go2joy에 전달하고 통합은 고객사 몫. 비용 0이지만 G-1~G-3이 그대로 남고,
"SDK를 제공해야 한다"는 요구사항 문언과 어긋난다.

### C안: 네이티브 채팅 UI SDK (거부)
Compose로 채팅 화면 재작성. 같은 기능이 두 벌이 되고 웹 수정이 앱에 안 닿는다 —
PLN-260820에서 이미 기각한 방향이며 재론할 근거 없음.

**권장: A안.** 아메바 철학(적정기술·재사용)에 부합 — 계약과 위젯은 그대로 두고, WebView의
플랫폼 결함만 라이브러리로 흡수한다.

## 4. A안 작업 구조 (PLN 골격)

| 단계 | 내용 | 비고 |
|---|---|---|
| W1 | 라이브러리 코어: `ShopTalkConfig`/`ShopTalkUser`/`ShopTalkChatFragment`(또는 View), 브리지 송수신, identify/open/logout API | Gradle 단독 프로젝트 |
| W2 | WebView 결함 흡수: 파일선택기(+카메라 여부는 확인 필요), 외부 링크, 키보드, DOM storage, 로딩 | 체크리스트 7항 = 인수 기준 |
| W3 | 샘플 앱 + **실기기 검증** (G-4 해소: 첨부 왕복·키보드·링크·세션 유지·프로세스 복원) | 에뮬레이터 + 실기기 1대 이상 |
| W4 | 배포 채널 + 문서: AAR 산출, 가이드에 "라이브러리로 붙는 법" 절 추가, README | 배포 채널은 §6-Q1 |
| W5 | go2joy 온보딩: embed secret 발급, 서버 서명 엔드포인트 가이드(코드 예시), `shop`·`agent` 값 확정, 스테이징 연동 확인 | go2joy 백엔드 협업 필요 |

**리포 배치 주의**: `packages/` 밑에 두더라도 **`package.json`을 만들지 않는다** — npm 워크스페이스
글롭에 걸려 lockfile 불일치로 `npm ci`가 통째로 거부된 전례가 shoptalk-rn에서 실증됐다
(RPT-260820 §4). Gradle 단독 프로젝트로 두고, CI 게이트(JDK 17 + Android SDK)는 선택 항목으로
분리한다. UI 변경 없음(콘솔·위젯 화면 무변경) — 와이어프레임 해당 없음, 단 PLN에는 통합
API 표면(위 코드 블록 수준)을 명세한다.

## 5. 제약·리스크

- **시크릿은 앱에 넣을 수 없다** — HMAC 서명은 go2joy 서버에서. 앱 번들은 추출 가능 (가이드 §3).
- 오리진 허용목록은 앱에 적용되지 않는다 — 앱의 방어선은 서명 신원뿐 (RPT R-5).
- WebView 안 예외는 콘솔이 없다 — 호스트가 부르는 전역은 언제 불려도 안전해야 하며(기구현),
  라이브러리 쪽도 같은 원칙으로: 콜백 예외가 WebView를 죽이지 않게.
- minSdk에 따라 WebView 동작 편차 — go2joy 앱의 minSdk 확인 필요.
- G-6(푸시)은 이번 범위에서 **명시적으로 제외/포함을 결정**해야 한다. 포함 시 FCM 토큰 등록
  API + 서버 발송 경로가 별도 트랙(백엔드 신규)이다.

## 6. 확인 필요 (PLN 전 결정 사항)

| ID | 질문 | 선택지 |
|---|---|---|
| Q1 | **배포 채널** | ① AAR 파일 직접 전달(가장 단순) ② GitHub Packages Maven(비공개 리포 + 토큰) ③ JitPack(공개 리포 신설 필요) |
| Q2 | go2joy의 `shop` 식별 값·대상 환경(스테이징 → 운영 시점)·사용할 `agent` 코드 | go2joy 테넌트 설정 확인 |
| Q3 | 앱 minSdk / targetSdk, 진입 형태(전체 화면 Activity vs Fragment vs BottomSheet) | go2joy 앱 팀 확인 |
| Q4 | 첨부에 카메라 직접 촬영 포함 여부(권한 처리 추가) | 갤러리만이면 권한 불요 |
| Q5 | 푸시 알림(G-6) 범위 포함 여부 | 제외 권장(별도 REQ), 단 명시적 결정 필요 |

## 7. 결론

Kotlin SDK는 **0에서 만드는 것이 아니다.** Android 브리지 채널·`mode=app`·메시지 계약·큐·
Kotlin 스니펫·시뮬레이터까지 배포되어 있고, 없는 것은 (1) 이를 감싼 **배포 가능한 AAR
라이브러리**, (2) **실기기 검증**, (3) **go2joy 온보딩**(서명·값 확정)이다. A안(얇은 Kotlin
래퍼, W1~W5)을 권장하며, §6의 Q1~Q5 확정 후 PLN을 작성한다. **PLN 승인 전 구현은 시작하지
않는다.**

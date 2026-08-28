# PLN-260827-Kotlin-Android-SDK

go2joy 코틀린 앱용 ShopTalk Android SDK(AAR) — 구현 계획.

- 작성일: 2026-08-27
- 선행: `REQ-260827-Kotlin-Android-SDK.md` (A안 채택)
- **UI 영향 없음** — 콘솔·위젯·서버 화면/스키마 전부 무수정. 신규 산출물은 별도 Gradle
  프로젝트(Android 라이브러리 + 샘플 앱)와 문서뿐. 와이어프레임 해당 없음 —
  대신 §3에 통합 API 표면을 명세한다.
- **마이그레이션 없음** · 서버 배포 없음

## 1. 확정된 결정 사항

| ID | 결정 | 근거 |
|---|---|---|
| Q1 | **AAR 파일 직접 전달** | 사용자 확정. 따라서 **외부 의존성 최소화가 설계 제약**이 된다 — AAR에는 의존성 메타데이터(POM)가 없어, 우리가 쓰는 라이브러리는 go2joy가 이미 갖고 있을 androidx 기본군(core·fragment·appcompat)으로 한정한다. Custom Tabs(androidx.browser) 대신 `ACTION_VIEW` 인텐트로 외부 링크를 연다 |
| Q2 | `shop`·`agent` 값·환경은 **W5 온보딩에서 확정** (기본값: 스테이징 `shoptalk.amoeba.site` 먼저, 운영 전환은 별도) | 무난한 기본값 |
| Q3 | **minSdk 24 / target·compile 35 / Kotlin·AGP 최신 안정판 / JDK 17**, 진입 형태는 **Fragment 기본**(`ShopTalkChatFragment`) — Activity·BottomSheet 어디에든 호스트가 담을 수 있는 최소 공배수 | 무난한 기본값. go2joy minSdk가 24 미만으로 확인되면 W1에서 하향 검토 |
| Q4 | 첨부는 **갤러리/파일 선택만** — 카메라 직접 촬영 제외 → 런타임 권한 처리 불요 | 무난한 기본값 |
| Q5 | **푸시 알림 제외** — 백그라운드 새 메시지 알림(FCM+서버 발송)은 별도 REQ | 사용자 확정 |

## 2. 배치와 빌드 격리

```
sdk/android/                 ← 신규 Gradle 루트 (npm 워크스페이스 밖)
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/ · gradlew*
├── shoptalk/                ← :shoptalk 라이브러리 모듈 → AAR
└── sample/                  ← :sample 검증용 앱 (전달물 아님)
```

- `packages/` 밑이 아닌 **최상위 `sdk/android/`**: shoptalk-rn 때 lockfile 불일치로 `npm ci`가
  거부된 전례(RPT-260820 §4)를 원천 차단. `package.json`을 두지 않으므로 npm 워크스페이스
  글롭(`apps/*`,`packages/*`)에 걸리지 않고, CI(ci.yml)는 Node 전용이라 Gradle 디렉터리를
  건드리지 않는다(확인됨).
- Gradle CI 게이트는 이번 범위에서 **추가하지 않는다**(단일 고객사 AAR 수동 전달 단계에서
  과잉). 빌드 재현성은 gradlew + 버전 카탈로그 고정으로 확보.

## 3. API 표면 (계약)

go2joy 쪽 통합 코드가 아래 이상으로 커지면 설계 실패로 본다.

```kotlin
// 생성
val chat = ShopTalkChatFragment.newInstance(
    ShopTalkConfig(
        widgetUrl = "https://shoptalk.amoeba.site/widget/",
        shop = "<W5에서 확정>",
        locale = "vi",              // 선택 — 미지정 시 위젯 자동 감지
        agent = null,               // 선택 — go2joy AI 에이전트 코드
    )
)
supportFragmentManager.commit { replace(R.id.container, chat) }

// 신원 — hash는 반드시 go2joy 서버가 HMAC_SHA256(embed_secret, userId)로 서명
chat.identify(ShopTalkUser(userId = uid, hash = signedHash, name = null, email = null, phone = null))

// 제어
chat.open(ShopTalkTab.ORDERS)      // CHAT | ORDERS | NOTIFICATIONS
chat.setLocale("vi")
chat.logout()

// 콜백 (리스너 인터페이스, 호스트 예외는 삼켜서 WebView를 지키지 않고 로그만)
chat.listener = object : ShopTalkListener {
    override fun onCloseRequest() { /* 이 화면을 닫아라 — 필수 구현 */ }
    override fun onReady() {}
    override fun onIdentified(ok: Boolean) {}
}
```

내부 구조(파일 6개 내외, 전부 기존 브리지 계약 위 — 위젯 무수정):

| 파일 | 책임 |
|---|---|
| `ShopTalkConfig.kt` / `ShopTalkUser.kt` | 값 객체. URL 조립(`embed=1&mode=app&shop&locale&agent`), locale 5자 절단(RN 참조와 동일) |
| `ShopTalkChatFragment.kt` | 수명주기 소유. WebView 생성·복원, 로딩 인디케이터, identify 재전송(`ivy:ready` 수신 시 — 위젯 쪽 20건 큐가 역방향 보증) |
| `ShopTalkBridge.kt` | `@JavascriptInterface postMessage` 수신(인터페이스명 `ShopTalkAndroid` 고정) + `evaluateJavascript("window.__shoptalkHost && window.__shoptalkHost(<JSONObject.quote>)")` 송신. 수신 JSON 파싱 실패는 무시(우리 것 아님) |
| `ShopTalkWebChromeClient.kt` | `onShowFileChooser` → ActivityResult API(`FileChooserParams.createIntent()`), 취소 시 `onReceiveValue(null)` **필수**(안 하면 이후 선택기가 다시 안 뜸) |
| `ShopTalkWebViewClient.kt` | 위젯 오리진 밖 URL → `ACTION_VIEW`로 시스템 브라우저. `about:blank` 허용 |

WebView 설정: `javaScriptEnabled` · `domStorageEnabled`(세션 localStorage — 없으면 방문마다
대화 끊김) · `adjustResize`+WindowInsets(키보드) · 다크모드는 위젯 테마에 위임.

## 4. 단계별 계획

| 단계 | 내용 | 산출물 |
|---|---|---|
| W1 | Gradle 루트 + `:shoptalk` 코어: 값 객체, Fragment, 브리지 송수신, identify/open/logout | 빌드되는 AAR, JVM 단위 테스트(URL 조립·JSON 이스케이프·메시지 파싱) |
| W2 | WebView 결함 흡수: 파일선택기(갤러리), 외부 링크, 키보드, DOM storage, 로딩, 회전·프로세스 복원 | 체크리스트 7항(가이드 §7) 전부 라이브러리 책임으로 이전 |
| W3 | `:sample` 앱 + **실기기 검증** — 시뮬레이터가 못 보는 것만: 첨부 왕복, 키보드, 링크 복귀, 재실행 세션 유지, 회전, 서명 신원 왕복(스테이징) | TCR-260827 기록 |
| W4 | 전달 패키지: 버전 명명(`shoptalk-android-0.1.0.aar`), `assembleRelease` 절차, 연동 가이드에 "AAR로 붙기" 절 추가(기존 §6 스니펫은 '수동 통합'으로 강등), README | AAR + 문서 |
| W5 | go2joy 온보딩: embed secret 발급, **서버 서명 엔드포인트 예시 코드**(시크릿은 앱 금지), `shop`·`agent`·minSdk 확정, 스테이징 연동 확인 | 온보딩 체크리스트 |

W1→W2는 순차, W3부터 사용자 육안·실기기 개입 필요. 예상 규모: 라이브러리 수백 줄 + 샘플 앱.

## 5. 사이드 임팩트 분석

| 영역 | 영향 |
|---|---|
| 서버(API)·위젯·콘솔 | **무수정 무영향.** 브리지 계약·`mode=app`·`agent` 파라미터 전부 기배포분 사용 |
| CI | 무영향 — Node 전용 파이프라인이 `sdk/android/` 미인식. lockfile 변화 없음 |
| 웹 임베드·RN·iOS 경로 | 무영향 — 채널만 다른 동일 계약. 라이브러리는 소비자일 뿐 |
| 스테이징 | 배포 없음. W3/W5 검증 트래픽만(go2joy 테넌트, 게스트+서명 신원 세션 소량) |
| 보안 | 오리진 허용목록은 앱 미적용(REQ §5) — 방어선은 서명 신원. AAR엔 시크릿·키 일절 포함 안 함 |

## 6. 리스크와 완화

- **실기기 확보** — 최소 에뮬레이터(API 24·35 양단) + 실기기 1대. 실기기 불가 시 TCR에
  명시하고 go2joy 첫 통합을 베타로 규정.
- **go2joy minSdk < 24**일 가능성 — W5 확인 전 W1에서 desugaring 없는 API만 사용해 하향 여지 확보.
- **AAR 직접 전달의 갱신 경로** — 계약이 바뀌면 재전달이 유일한 배포 수단. 위젯 쪽은
  하위호환(미지 메시지 무시)이 기구현이므로, 라이브러리도 미지 타입 무시로 대칭을 지킨다.
- **WebView 안 예외는 안 보인다**(RPT-260820 예방 패턴) — 호스트 콜백 예외를 try-catch로
  격리, 브리지 실패는 조용히 무시(기존 원칙과 동일).

## 7. 검증 계획 (TCR 예고)

- 단위(JVM): URL 조립(파라미터 유무 조합), `JSONObject.quote` 이스케이프(따옴표·개행·유니코드),
  수신 메시지 분기(ready/close-request/identified/미지 타입), listener 예외 격리.
- 실기기/에뮬레이터(W3): ① `ivy:ready` 수신 → identify 자동 전송 → `identified ok:true`
  ② X 클릭 → `onCloseRequest` 호출(빈 화면 없음) ③ 사진 첨부 갤러리 왕복 ④ 대화 내 외부
  링크 → 시스템 브라우저 → 복귀 시 대화 유지 ⑤ 키보드 위 입력창 노출 ⑥ 앱 재실행 후 세션
  유지 ⑦ 회전·백그라운드 복귀 ⑧ 서명 불일치 시 게스트 지속(로그인 실패가 문의를 막지 않음).

## 8. 완료 기준

AAR 하나 + 가이드만으로 제3자가 §3 코드 분량으로 통합을 재현하고, §7 실기기 항목 ①~⑧이
스테이징에서 통과하며, go2joy에 secret·값·패키지가 전달된 상태.

---
**본 PLN은 사용자 승인 후 구현에 착수한다.**

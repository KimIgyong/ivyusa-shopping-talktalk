# RPT-260829 — Kotlin Android SDK(AAR) + 앱모드 위젯 결함 5건 수정

- 추적: `REQ-260826-Go2Joy-Kotlin-Mobile-SDK.md`(분석) → `REQ-260827-Kotlin-Android-SDK.md` →
  `PLN-260827-Kotlin-Android-SDK.md`(승인) → `TCR-260828-Kotlin-Android-SDK.md` ·
  `FIX-260828-Widget-AppMode-Defects.md`
- **PR #428** (squash) — main `bb1dbb4`, 2026-08-29 머지. 분석서는 **PR #452**(`ba2b6d7`).
- **스키마 변경 없음** — 마이그레이션 불필요, 머지 후 즉시 스테이징 배포(§3)

## 1. 무엇이 만들어졌나

1. **`sdk/android` — 독립 Gradle 프로젝트**(:shoptalk AAR + :sample 데모 앱).
   npm 워크스페이스 밖·package.json 없음(RN lockfile 함정 회피)이라 기존 Node CI 무영향.
   빌드: `./gradlew :shoptalk:assembleRelease` → `dist/shoptalk-android-0.1.0.aar`
   (산출물 미커밋 — AAR 직접 전달, go2joy 기기에 샘플 앱 설치 상태).
2. **`ShopTalkChatFragment`** 하나로 통합: WebView 브리지(`ShopTalkAndroid`/`__shoptalkHost`),
   `onShowFileChooser`(사진 첨부), 외부링크 `ACTION_VIEW`, adjustResize+IME 인셋,
   `restoreState`, ready 전 명령 큐(20건)+ready 시 identify/locale 재전송.
   공개 API: `ShopTalkConfig`/`User`/`Tab`/`Listener`; 의존성은 androidx 기본군만.
3. **위젯 결함 5건 수정**(전부 기존 코드 결함 — SDK가 처음 밟은 경로,
   상세·예방 패턴은 FIX-260828): ① locale 명령이 UI 언어 미변경(스위처와 동일 동작으로
   통일) ② 세션 토큰 전 도착 identify/locale 조용히 유실(파킹+토큰 구독 재생)
   ③ 브리지 사전 큐가 첫 구독자 독식(다음 틱·전체 구독자 배달)
   ④ **첨부 업로드 불순 updater로 조건부 0건 — 웹 임베드 포함 전 채널 영향**
   (ref 미러+순수 updater) ⑤ 앱모드 광폭에서 패널 반쪽 렌더(isAppMode면 전폭).
4. 가이드 정정: `locale` URL 파라미터는 죽은 파라미터였음을 명시(모바일 SDK 가이드 §1),
   브리지 명령으로 전달하도록 SDK 구현.

## 2. 파일 (35 files, +1,934/−63)

- 신규 `sdk/android/**` (Gradle 설정·`shoptalk` 라이브러리 7클래스·sample 앱·JVM 테스트 2)
- 위젯: `useEmbedCommands.ts` · `host-bridge.ts`(+계약 테스트) · `useAttachmentUpload.ts` ·
  `WidgetPanel.tsx`
- 문서: REQ/PLN-260827 · TCR/FIX-260828 · 모바일 SDK 가이드 갱신

## 3. 검증·배포 상태

| 단계 | 결과 |
|---|---|
| JVM 단위 | 13/13 (Config URL·프로토콜 이스케이프·리스너 예외 격리 등, TCR §1) |
| 위젯/모노레포 | 위젯 스위트 24/24(이중 구독자 회귀 포함) · typecheck 9/9 · CI green |
| 실기기 E2E | SM-G991N(API 35) × go2joy 실데이터 × 로컬 위젯+스테이징 API — PLN §7 ①~⑧ 중 7건 ✅ (TCR §2; identify 왕복·첨부 201·locale 전면 VI·회전/재실행 세션 유지) |
| 스테이징 배포 | 8/29 `deploy-staging.sh` @ `bb1dbb4` — api `successfully started`·재시드 없음·web/widget 200, **번들 내용으로 신코드 확증**(locale→`changeLanguage` 분기 — 구버전에 없음). ④ 수정이 웹 고객에게도 반영됨 |

## 4. 잔여 (W5 온보딩에서)

- go2joy 테넌트 **embed_secret 발급** → `identified ok=true` 실서명 검증
  (현재는 시크릿 미발급이라 `ok=false`+게스트 지속까지만 확인)
- go2joy `agent` 코드·minSdk 확정(하단 API 24 에뮬레이터 미검증), 외부 링크 실기기 육안
- 스테이징 위젯 원본 대상 실기기 재검증(이번 E2E는 로컬 위젯 조합) — 배포는 완료됐으므로
  다음 실기기 세션에서 `https://shoptalk.amoeba.site/widget` 직결로 확인

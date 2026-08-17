# RPT-260817-Multilang-VI-JA-ZH

시스템 언어를 **en/es/ko → en/es/ko/vi/ja/zh 6종**으로 확장한 구현 보고.
분석 `docs/analysis/REQ-260817-Multilang-VI-JA-ZH.md` · 계획 `docs/plan/PLN-260817-Multilang-VI-JA-ZH.md`
(사용자 승인 2026-08-17, 권장 순서 W0→W5 그대로 진행).

## 1. 배포 상태

| 항목 | 값 |
|---|---|
| 브랜치 | `feature/i18n-6-languages` → squash merge |
| 커밋 | `94814e0`(W0) · `d7e8fce`(W1) · `8a357fc`(W2) · `a030b9e`(W3) · `6d85f73`(W4) · `137bb76`(W5) · `f32b6e3`(main 병합) |
| PR | **#299 머지 완료** — main `10e12b6` |
| 스테이징 | **배포·검증 완료 2026-08-17 10:49 UTC** (컨테이너 5종 재생성, API `Nest application successfully started`) |
| 마이그레이션 | **없음** (언어 컬럼이 전부 VARCHAR — REQ §1d). 적용할 SQL 자체가 없음 |
| CI | typecheck · test · build **pass** (1m25s) |

## 1-1. main 병합 (`f32b6e3`) — 브랜치 개설 중 60여 커밋 유입

로컬 `main`이 뒤처진 상태에서 브랜치를 떠, PR 시점에 충돌 8건이 발생했다.
그 사이 main에는 첨부파일·Drive 지식소스·메뉴 권한·코칭 이력·AMA SSO가 들어와 있었다.

- 충돌 해소: `index.ts`/`nav.json`×3(양쪽 가산) · `chat.service.ts`(main의
  `attachmentReceived` 유지 + 3언어 추가) · `messenger-ingest.ts`(main이 로케일 해석을
  `SessionService.languageForChannel`로 이관 → 이 브랜치의 `resolveLanguage` 삭제,
  커버리지는 `language.spec.ts`·`session.service.spec.ts`가 승계) ·
  `PreviewPanel.tsx`(main의 `CoachTarget` 유지, 하드코딩 `LANGS`는 제거 유지).
- ⚠️ **`i18n:check`가 병합 직후 언어당 226키 누락을 검출** — main이 브랜치 개설 이후 추가한
  신규 문구(메뉴 권한·라이브챗 초안/첨부·코칭 회귀/이력·Drive·AMA SSO·메뉴 차단 안내)가
  vi/ja/zh에 없었다. 226×3 전량 번역해 반영. 체커가 없었다면 **조용한 영어 폴백 상태로
  머지**됐을 항목들이며, 이 브랜치가 없애려던 실패 양상 그 자체다.
- main이 EN/ES/KO만으로 추가한 문구 2종(첨부 실패 안내, 상담원 회신메일 첨부 안내)도 6언어화.

## 2. 무엇을 바꿨나

### W0 — 언어 레지스트리 (`94814e0`)
- 신규 `packages/types/src/common/language.ts`: 코드·세션값·원어명·짧은라벨·검수여부·타임존
  기본값·콘솔 피커용 타임존을 한 테이블에. `LocalizedText`, `localized()`,
  `languageByCode/BySession`, `sessionLanguageForLocale/ForTimezone` 제공.
- `SESSION_LANGUAGE`를 여기로 이관하고 `enum.types.ts`는 재export(기존 import 경로 무손상).
- 신규 `scripts/i18n-check.mjs` + `npm run i18n:check`: 4개 앱 로케일을 영어 기준과 비교해
  **누락·잉여·빈 값이 하나라도 있으면 exit 1**. esbuild로 TS 로케일을 변환해 data URL import
  (정규식 파싱은 템플릿 문자열 하나에 무너짐).

### W1 — 백엔드 (`d7e8fce`)
- 내장 고객 문구 45종에 VI/JA/ZH 추가: 채팅 시스템 턴 7 · 시나리오 스크립트/후속칩 25 ·
  방치 대화 2 · 이슈 상태 안내 4 · 핸드백/근무시간외 2 · 상담원 회신 메일 3 · 배송 4단계 1.
- 타입 유니온 8곳 → `LocalizedText`. 단, **시나리오 스크립트는 `Record<SessionLanguage, string>`**
  (Partial 아님) — 7번째 언어가 프로덕션의 영어 응답이 아니라 컴파일 에러가 되도록.
- `resolveLanguage`/`languageForTimezone`/메신저 힌트 매퍼를 레지스트리로 대체.
  `Asia/Ho_Chi_Minh→VI`, `Asia/Tokyo→JA`, `Asia/Shanghai|Chongqing|Harbin|Urumqi→ZH` 추가.
- 위젯 문구 DTO에 `first_visit_{vi,ja,zh}`·`login_greeting_{vi,ja,zh}` 6필드(명시 나열 —
  `dto[\`first_visit_${code}\`]` 동적 조회는 필드가 없어도 컴파일되어 조용히 저장 누락).

### W2 — 위젯 (`8a357fc`)
- vi/ja/zh 180키씩. 헤더 언어 선택을 **3버튼 pill → 드롭다운**(380px 패널에서 6개는 실제로 넘침).
- CJK 폰트 폴백(Hiragino Sans / Noto Sans JP / PingFang SC / Noto Sans SC) + `<html lang>` 설정.
- 검수 대기 β는 위젯에 **미표시**(쇼퍼는 행동할 수 없는 정보).

### W3 — 콘솔 (`a030b9e`)
- 24 네임스페이스 × 1,455키 × 3언어. 로케일 로딩을 `import.meta.glob`으로 전환
  (명시 import 72줄 → 6언어면 144줄, 네임스페이스마다 6곳 수정 구조를 제거).
- 헤더 드롭다운(원어명 + β 배지 + 각주), 언어 탭 3곳을 공용 `LanguageTabs`로 추출
  (줄바꿈 + **입력된 언어 점 표시** — 6탭에서는 "어디가 비었는지"가 눈에 안 보임).
- 미리보기·지식QA 언어 선택 6개 원어명화.
- 타임존 select가 서울·뉴욕 2개만 제공해 신규 기본값 4개가 UI에서 도달 불가였던 것 수정
  (레지스트리 `pickerTimezone`).
- 랜딩 문구의 "English, Spanish and Korean"을 3개 언어 모두에서 6개로 갱신.
- 곁다리(PLN D6): 라이브챗 지식조회의 `language:'EN'` 하드코딩 → 콘솔 UI 언어 사용.

### W4 — 모바일·PWA (`6d85f73`)
- RN 123키 · PWA 129키 × 3언어. 두 앱의 언어 목록·라벨을 레지스트리로 통일.
- ⚠️ 발견: 모바일 `session-context.tsx`가 서버 세션 언어를 `['en','es','ko']` 리터럴로 게이팅 —
  일본어 세션 쇼퍼가 조용히 기기 언어로 되돌려졌을 경로. 레지스트리 참조로 수정.

### W5 — 문서
`CLAUDE.md` §1/§2 · `SPEC.md` §2.5/§13 · `.claude/skills/ivy-talktalk-dev/SKILL.md` §0/§2 갱신
(6개 언어, 레지스트리 단일 출처, `i18n:check` 필수, CJS 값 import 함정).
`docs/test/TCR-260817-Multilang-VI-JA-ZH.md` 작성.

## 3. 검증 결과

| 검사 | 결과 |
|---|---|
| `npm run i18n:check` | es·ko·**vi·ja·zh 전부 complete**(누락/잉여/빈 값 0) |
| `npm test` | api 966 · types 33 · common 13 **전부 통과**(신규 U-1~U-14 포함) |
| `npm run typecheck` | 9/9 tasks 성공 |
| 빌드 | 위젯·콘솔·PWA 프로덕션 빌드 성공, 모바일 타입체크 성공 |
| API 부팅 | `Nest application successfully started` (엔티티 변경 후 실기동 확인) |
| 회귀 | 기존 en/es/ko 문구·동작 무변화. 사전 테스트 1건만 전제가 바뀌어 갱신(`vi→EN` 기대 → `vi→VI`, 폴백 검증은 `th-TH`로 이전) |

### 3-1. 병합 후 최종 검증 (배포 직전)
| 검사 | 결과 |
|---|---|
| `npm test` | **1,366개 통과** (api 1,273 · common 60 · types 33) |
| `npm run i18n:check` | 5개 언어 전부 complete |
| `npm run typecheck` / 빌드 | 9/9, 위젯·콘솔·PWA 빌드 성공 |
| GitHub Actions | typecheck · test · build **pass** |

### 3-2. 스테이징 실환경 스모크 (2026-08-17, 배포 직후)
| # | 확인 | 결과 |
|---|---|---|
| D-1 | 컨테이너 재생성 | api(healthy)·web·widget·pwa·nginx 전부 Up |
| D-2 | API 부팅 로그 | `Nest application successfully started` |
| D-3 | `/api/v1/health` | 200 `{"status":"ok"}` |
| D-4 | `/` · `/widget/` · `/app/` | 200 / 200 / 200 |
| D-5 | 콘솔 번들에 신규 로케일 포함 | `Tiếng Việt`·`日本語`·`简体中文`·`配送状況`·`工作日志` 검출 |
| D-6 | 위젯 번들에 신규 로케일 포함 | `换货 · 退货`·`再入荷通知`·`Báo khi có hàng` 검출 |
| D-7 | **로케일→세션 언어 (실 API)** | vi-VN→VI · ja-JP→JA · zh-CN→ZH · **zh-TW→ZH** · **th-TH→EN** · ko-KR→KO · es-ES→ES |
| D-8 | 일본어 시나리오 턴 | 「キャンセル・返金・返品についてお手伝いできます…」 + 칩 4종 일본어 |
| D-9 | 베트남어 시나리오 턴(반품/교환) | 베트남어 스크립트 + 칩 3종 |
| D-10 | 중국어 시나리오 턴(배송) | 중국어 스크립트 + 칩 2종 |

TCR §3의 나머지 수동 항목(S-2 위젯 드롭다운 실화면, S-7~S-13 콘솔 UI, S-14 키워드 통계)은
브라우저에서 사람이 볼 항목이라 미실행.

## 4. 설계 판단 3가지 (기록)

1. **`@ivy/types` 값 import 불가** — 패키지가 CJS로 배포되어 Rollup이 `export *` 체인을 따라
   named export를 추적하지 못함(위젯 빌드 실패로 발견). 타입은 패키지 경유, **런타임 테이블만
   소스 파일 상대경로 deep import**. 대안(앱마다 목록 복제)은 이번 작업이 없애려던 문제 그 자체라
   채택하지 않음. Metro도 `watchFolders`가 리포 루트라 동일 방식으로 해결.
2. **중국어 = `zh`(간체)** — `zh-CN`으로 가면 위젯의 `split('-')[0]`, `keyword.util`의 `slice(0,2)`,
   `answer_reuse.lang` varchar(5)를 함께 손봐야 함. 번체는 후속 `zh-TW` 행으로 추가.
   현재 `zh-TW`/`zh-HK`는 간체로 폴백되며 테스트로 고정(U-4).
3. **β 배지 범위(PLN D4에서 의도적 이탈)** — D4는 "콘솔·모바일·PWA"였으나, 위젯에서 β를 숨긴 이유
   (쇼퍼는 그 정보로 아무것도 못 함 → 신뢰만 깎임)가 모바일·PWA에도 그대로 적용됨. 두 앱 모두
   쇼퍼용이므로 **β는 운영 콘솔에만** 표시.

## 5. 남은 일

| # | 항목 | 비고 |
|---|---|---|
| R-1 | **번역 원어민 검수** — 특히 환불/반품·개인정보 동의·근무시간외 문구(TCR §4 P0) | 완료 시 레지스트리 `reviewed:true` |
| R-2 | TCR §3 잔여 수동 스모크(S-2, S-7~S-14) — 브라우저 실화면 확인 | 배포는 완료 |
| R-3 | 질문 통계 일·중 키워드 실트래픽 확인(S-14) | 배포 후 24h 집계 필요 |
| R-4 | 백로그: 위젯 문구 DTO 중첩화(언어당 2필드 증식 구조) | PLN §3 W1 명시 |
| R-5 | 백로그: 콘솔 언어별 번들 청크 분리(현재 6언어 eager) | PLN §4 |
| R-6 | ~~`scripts/session-worktree.sh` 유실 의심~~ → **오판**. 뒤처진 로컬 main 기준이었고 `origin/main`에는 PR #264가 정상 존재 | 조치 불요 |

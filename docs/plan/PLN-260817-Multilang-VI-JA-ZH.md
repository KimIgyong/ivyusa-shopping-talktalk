# PLN-260817-Multilang-VI-JA-ZH

`docs/analysis/REQ-260817-Multilang-VI-JA-ZH.md` 의 구현 계획.
목표: 시스템 언어 **en/es/ko → en/es/ko/vi/ja/zh 6종**, 전 표면(콘솔·위젯·모바일·PWA·백엔드 문구).
번역은 **LLM 초벌 + 검수 대기(β) 표시**. **스키마 변경 없음 → `## Migration` 섹션 불필요.**

## 0. 설계 결정 (REQ §5 확정안)

| # | 결정 |
|---|---|
| D1 | 중국어 코드 = **`zh`** (간체/zh-Hans). 번체 필요 시 후속으로 `zh-TW` 별도 추가 |
| D2 | 세션 저장값 = `VI` / `JA` / `ZH` (varchar(8) 수용, 마이그레이션 불요) |
| D3 | 번역 = LLM 초벌 커밋 + TCR 검수 체크리스트 |
| D4 | β 배지 = **콘솔·모바일·PWA 에만 표시, 쇼퍼용 위젯에는 미표시** (쇼퍼에게 "번역 미검수"를 알리는 것은 신뢰도만 깎고 행동을 바꾸지 못함) |
| D5 | `web/i18n.ts` 는 **`import.meta.glob` 로 전환** — 명시 import 96줄이 6언어에서 192줄이 되고, 새 네임스페이스마다 6곳을 손대야 하는 구조를 여기서 끊는다 |
| D6 | REQ §3 의 기존 결함(LiveChatPage 지식조회 `language:'EN'` 하드코딩)은 **W3 에 곁다리 포함** (1줄, 세션 언어 대신 현재 UI 언어 사용) |

## 1. 핵심 설계 — 언어 레지스트리 단일 출처

`packages/types/src/common/language.ts` (신규)

```ts
export interface LanguageDef {
  code: string;        // i18next lng — 'en' | 'es' | 'ko' | 'vi' | 'ja' | 'zh'
  session: string;     // DB session.language — 'EN' … 'ZH'
  nativeLabel: string; // 선택 UI 표기 — 'English' | '한국어' | 'Tiếng Việt' | '日本語' | '简体中文'
  shortLabel: string;  // 폭이 좁은 곳(위젯) — 'EN' | 'KO' | 'VI' | 'JA' | 'ZH'
  reviewed: boolean;   // false = LLM 초벌, 검수 대기(β)
}
export const LANGUAGES: readonly LanguageDef[] = [ /* en,es,ko(reviewed) + vi,ja,zh(false) */ ];
export const LANGUAGE_CODES = LANGUAGES.map(l => l.code);
export const SESSION_LANGUAGE = { EN:'EN', ES:'ES', KO:'KO', VI:'VI', JA:'JA', ZH:'ZH' } as const;
export type LocalizedText = Partial<Record<SessionLanguage, string>>;
```

REQ §1a 의 L1~L7(20곳)이 전부 여기를 참조하게 바꾼다. `'EN'|'ES'|'KO'` 리터럴 유니온 8곳은
`LocalizedText` 로 치환 — 다음 언어 추가는 **레지스트리 1줄 + 번역 파일**로 끝난다.

## 2. 와이어프레임 (⚠️ UI 변경분)

### 2-1. 위젯 헤더 — 3버튼 pill → 드롭다운 (G2)

패널 폭 데스크톱 380px / 모바일 full. 현재 pill 3개도 이미 빠듯하고, 6개는 확실히 넘친다.

```
AS-IS (3언어, 겨우 들어감)
┌───────────────────────────────────────────────┐
│ IVY USA          [EN][ES][한국어]  [⚙]  [✕]  │  ← 380px 상한 근접
└───────────────────────────────────────────────┘

AS-IS 그대로 6언어를 넣으면 (파손)
┌───────────────────────────────────────────────┐
│ IVY USA  [EN][ES][한국어][VI][JA][ZH] [⚙] [✕]│  ← 넘침/줄바꿈, 이름 잘림
└───────────────────────────────────────────────┘

TO-BE — 현재 언어만 표시하는 컴팩트 드롭다운
┌───────────────────────────────────────────────┐
│ IVY USA               [🌐 KO ▾]   [⚙]   [✕]  │
└───────────────────────────────────────────────┘
                            │ 클릭 시
                            ▼
                  ┌──────────────────┐
                  │ English          │
                  │ Español          │
                  │ 한국어         ✓ │  ← 현재 언어 체크
                  │ Tiếng Việt       │
                  │ 日本語           │
                  │ 简体中文         │
                  └──────────────────┘
```
- 버튼: `[🌐 {shortLabel} ▾]`, `aria-haspopup="listbox"` + `aria-expanded`, 목록은 `role="listbox"`/`option`.
- 키보드: ↑↓ 이동, Enter 선택, Esc 닫기, 외부 클릭 닫기(기존 위젯 설정 팝오버와 동일 패턴).
- 선택 동작은 기존과 동일 — `i18n.changeLanguage` + localStorage(`ivy_lang`) + `setSessionLanguage(token, CODE)`.
- D4 에 따라 **β 배지 없음**.

### 2-2. 콘솔 헤더 — 동일 드롭다운 + 검수 배지 (G2)

```
TO-BE
┌──────────────────────────────────────────────────────────────────┐
│ [≡]  대시보드                          [🌐 한국어 ▾]   [프로필]  │
└──────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                  ┌──────────────────────┐
                                  │ English              │
                                  │ Español              │
                                  │ 한국어             ✓ │
                                  │ Tiếng Việt        β  │  ← 검수 대기
                                  │ 日本語            β  │
                                  │ 简体中文          β  │
                                  ├──────────────────────┤
                                  │ β 기계번역 · 검수 대기│  ← 각주 1줄
                                  └──────────────────────┘
```

### 2-3. 콘솔 언어별 편집 탭 — 3탭 가로 → 6탭 (G3)

대상 5곳: 설정>위젯문구(`COPY_LANGS`) · AI설정>시나리오 답변(`ScenarioReplyEditor`) ·
AI설정>이관 문구(`HandoffSection`) · AI설정>미리보기(`PreviewPanel`) · 지식>QA(`KnowledgeQaPanel`).

```
AS-IS                        TO-BE (문구 편집기 — 6탭 + 입력여부 점)
언어 [EN][ES][KO]            언어 [EN•][ES ][KO•][VI ][JA ][ZH ]
                                   └ • = 해당 언어 문구가 입력됨(빈칸이면 EN 폴백)
┌──────────────────────────────────────────────────────────────┐
│ 첫 방문 인사말                                               │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Welcome! How can we help you today?                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│ 비워두면 English 문구가 사용됩니다.                          │
└──────────────────────────────────────────────────────────────┘

TO-BE (미리보기·지식QA — 단순 언어 선택이므로 Select 로 교체)
언어 [ 한국어              ▾ ]
```
- 탭 행은 `flex-wrap` — 6개는 데스크톱 1행, 좁은 폭에서 2행으로 접힘(잘림 없음).
- 점(`•`) 표시는 신규: 6언어가 되면 "어느 언어를 아직 안 채웠는지"가 눈으로 안 보인다.

### 2-4. 모바일 / PWA 설정 — 기존 목록에 3행 추가

```
┌─────────────────────────────┐
│ 언어                        │
├─────────────────────────────┤
│ English                     │
│ Español                     │
│ 한국어                    ✓ │
│ Tiếng Việt               β  │
│ 日本語                   β  │
│ 简体中文                 β  │
└─────────────────────────────┘
```
구조 변경 없음(이미 세로 목록) — 항목 3개 + β 배지만 추가.

## 3. 단계 계획 (PR 분할)

번역 5,750 문자열을 한 PR 로 올리면 리뷰가 불가능하므로 **앱 단위로 분할**한다.
각 단계는 독립 배포 가능(모든 조회 경로에 `?? EN` 폴백이 있어 부분 배포도 무해).

| 단계 | 내용 | 주요 파일 | 산출 |
|---|---|---|---|
| **W0** 기반 | 언어 레지스트리 + `LocalizedText` + 완전성 검사 스크립트 | `packages/types/src/common/language.ts`(신규), `enum.types.ts`, `scripts/i18n-check.mjs`(신규), `package.json`(`i18n:check`) | PR-1 |
| **W1** 백엔드 | 문구 맵 9곳에 VI/JA/ZH 추가(45×3=135) · `resolveLanguage`/`languageForTimezone`/메신저 힌트 확장 · `keyword.util` CJK 2-gram + vi 불용어 · 위젯문구 DTO 6필드 추가 · 타입 유니온 8곳 → `LocalizedText` | `chat/{scenario,chat,idle-conversation}.service.ts`, `issue/issue-notice.ts`, `agent/agent.service.ts`, `messenger/messenger-ingest.service.ts`, `ai-engine/handoff-router.service.ts`, `session/session.service.ts`, `analytics/keyword.util.ts`, `tenant/{tenant.service.ts,dto/request/tenant.request.ts}`, `ai-engine/entity/tenant-ai-config.entity.ts`, `packages/types/domain/status-map.ts` | PR-2 |
| **W2** 위젯 | i18n 등록 + 번역 3파일(170×3) + 헤더 드롭다운(2-1) + 폰트 스택 | `apps/widget/src/i18n/*`, `components/widget/LanguageSwitcher.tsx`, `src/index.css` | PR-3 |
| **W3** 콘솔 | `import.meta.glob` 전환(D5) + 번역 72파일(1,455×3) + 헤더 드롭다운(2-2) + 편집 탭 5곳(2-3) + D6 곁다리 수정 | `apps/web/src/i18n/*`, `layouts/Header.tsx`, `domain/settings/SettingsPage.tsx`, `domain/ai-settings/{ScenarioReplyEditor,HandoffSection,PreviewPanel}.tsx`, `domain/knowledge/KnowledgeQaPanel.tsx`, `domain/live-chat/LiveChatPage.tsx`, `src/index.css` | PR-4 (번역만 별도 커밋으로 분리) |
| **W4** 모바일·PWA | config + 번역 6파일(246×3) + 라벨 3곳(2-4) | `apps/{mobile,pwa}/src/lib/config.ts`, `src/i18n/locales/*`, `mobile/app/{onboarding,settings}.tsx`, `pwa/src/pages/SettingsPage.tsx` | PR-5 |
| **W5** 문서·검증 | `CLAUDE.md` §1/§2 · `SPEC.md` §13 · 스킬 §0 의 "en/es/ko" 갱신 + TCR + RPT | `CLAUDE.md`, `SPEC.md`, `.claude/skills/ivy-talktalk-dev/SKILL.md`, `docs/test/TCR-260817-*.md`, `docs/implementation/RPT-260817-*.md` | PR-6 |

### W1 세부 — 조용히 깨지는 두 곳

1) **키워드 추출 (REQ G5)** — 일·중은 공백 분절이 없어 현재 `else` 분기가 문장 전체를 1토큰으로 만든다.
   한글 런 로직을 CJK 로 일반화한다:
   ```
   ko : [가-힣]{2,}          런 → 2-gram   (현행 유지)
   ja : [ぁ-んァ-ヶ一-龯]{2,} 런 → 2-gram   (가나+한자, 한 런으로 취급)
   zh : [一-龯]{2,}           런 → 2-gram
   vi : 공백 단위 + vi 불용어(là, của, và, có, không, tôi, bạn, cho, được, khi, nào …)
   ```
   기존 한국어 분기의 "라틴 토큰도 함께 수집" 규칙은 ja/zh 에도 그대로 적용(주문번호·제품명).

2) **로케일 감지 (REQ G6)** — 접두 매칭 테이블을 레지스트리에서 생성하고, 타임존 기본값에
   `Asia/Ho_Chi_Minh→VI`, `Asia/Tokyo→JA`, `Asia/Shanghai|Asia/Chongqing|Asia/Harbin→ZH` 추가.
   ⚠️ `zh-TW`/`zh-HK` 는 D1 에 따라 당분간 `ZH`(간체)로 매핑된다 — 의도된 동작으로 주석에 명시.

### 폰트 (REQ G7)
```css
font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Hiragino Sans',
             'Noto Sans JP', 'PingFang SC', 'Noto Sans SC', 'Segoe UI', Roboto, sans-serif;
```
+ 언어 전환 시 `document.documentElement.lang` 갱신(브라우저 한자 자형 선택의 근거).
웹폰트 추가 다운로드 없음 — 시스템 폰트 폴백만 보강.

### i18n 완전성 검사 (REQ G11)
`scripts/i18n-check.mjs` — en 을 기준으로 4개 앱의 모든 언어 리소스를 비교해
**누락 키 / 잉여 키 / 빈 문자열**을 보고하고 하나라도 있으면 exit 1.
`npm run i18n:check` 로 등록, W5 에서 문서화. (CI 게이트 자체가 없는 상태이므로 우선 수동 실행.)

## 4. 부수 영향 분석

| 영역 | 영향 | 판단 |
|---|---|---|
| DB 스키마 | 없음 — 언어 컬럼 전부 VARCHAR (REQ §1d) | ✅ 마이그레이션·`## Migration` 불요 |
| 기존 3언어 동작 | 레지스트리 치환은 값 동등(en/es/ko 순서·코드 불변) | ✅ 회귀 없음, 테스트로 고정 |
| AI/RAG 응답 | `Reply in language code: ${language}` 가 코드 전달만 함 | ✅ 코드 변경 불요, 실제 응답 품질은 TCR 로 확인 |
| 모더레이션 | 룰 `lang` 은 varchar + NULL=전체 | ✅ 기존 룰이 신규 언어에도 적용(NULL 룰), 언어별 룰은 운영 추가 사항 |
| 답변 재사용(`answer_reuse`) | `lang` varchar(5) — 'ZH' 수용 | ✅ (D1 이 `zh-CN` 이었다면 경계값) |
| KB 검색 | ngram 파서가 CJK 색인 | ✅ / vi 는 공백 분절이라 기존 경로로 동작 |
| 위젯 번들 크기 | 번역 3언어분 추가 ≈ +12KB(gzip 전) | 허용 — 위젯은 단일 번들이라 지연 로딩은 백로그 |
| 콘솔 번들 | `import.meta.glob(eager)` 로 6언어 전량 포함 ≈ +180KB | 콘솔은 로그인 후 앱이라 허용. 언어별 청크 분리는 백로그 |
| 기존 테넌트 데이터 | 기존 `widget_copy`/`scenarioOverride` JSON 은 EN/ES/KO 키만 보유 → 신규 언어는 EN 폴백 | ✅ 의도된 동작(설명 문구를 편집 UI 에 노출) |
| 상담원 배정 | `agent_profile.languages` varchar(64) 에 6언어 CSV = 최대 17자 | ✅ 여유 |

## 5. 테스트 계획 (TCR 예고)
- 단위: 레지스트리 매핑(코드↔세션값), `resolveLanguage` 6언어 + 타임존 기본값, `keyword.util` ja/zh 2-gram·vi 불용어, `sysMsg`/`deliverySteps` 신규 언어 및 폴백, `i18n-check` 자체.
- 통합: 위젯 세션을 `vi`/`ja`/`zh` 로 생성 → UI·시스템 문구·AI 응답 언어 일치, 언어 전환 후 세션 반영.
- 엣지: 미등록 로케일(`zh-TW`, `th`) 폴백, 신규 언어 문구 미입력 테넌트, 6언어 탭 좁은 폭 줄바꿈, 위젯 380px 드롭다운.
- 회귀: 기존 en/es/ko 화면·문구 무변화(스냅샷 성격의 수동 확인 + 기존 spec 유지).

## 6. 리스크와 대응
| 리스크 | 대응 |
|---|---|
| 번역 품질(검수 전) | β 표시(D4) + TCR 검수 체크리스트. 특히 **환불·반품·개인정보 동의 문구**는 오역 시 분쟁 소지 → 이 3종은 검수 완료 전 사용자 확인 요청 |
| 대량 번역 PR 리뷰 불가 | 앱 단위 PR 분할 + 번역은 별도 커밋으로 분리 |
| 20곳 치환 중 누락 | `i18n-check` 스크립트 + 레지스트리로 컴파일 타임 강제(`LocalizedText` 타입) |
| 위젯/콘솔 UI 실파손 | W2/W3 에서 실화면(380px·모바일 폭) 확인 후 배포 |

## 7. 승인 요청
아래를 확정해 주시면 **W0 부터 구현을 시작**합니다.
1. D1(중국어 = `zh` 간체, 번체는 후속) · D4(위젯에는 β 미표시) 동의 여부
2. 단계 순서 — 기본안은 W0 → W1 → W2 → W3 → W4 → W5.
   고객 접점을 먼저 보시려면 **W0 → W2(위젯) → W1(백엔드)** 로 바꿔도 됩니다
3. 오역 리스크가 큰 문구(환불/반품/동의)를 **검수 전에도 배포**할지, 해당 3종만 EN 폴백으로 둘지

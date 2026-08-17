# REQ-260817-Multilang-VI-JA-ZH

시스템 언어를 현재 **en / es / ko 3종**에서 **베트남어(vi) · 일본어(ja) · 중국어 간체(zh) 를 더한 6종**으로
확장하기 위한 분석. 범위는 사용자 확인(2026-08-17)에 따라 **전 표면 일괄**(콘솔 web · 위젯 · 모바일 ·
PWA · 백엔드 상담/시나리오 문구), 번역은 **LLM 초벌 + 검수 대기 표시** 방식.

## 1. AS-IS

### 1a. 언어 목록이 선언된 곳 (단일 출처 없음 — 5벌 중복)
| # | 위치 | 형태 | 값 |
|---|---|---|---|
| L1 | `packages/types/src/common/enum.types.ts:45` | `SESSION_LANGUAGE` const | `{EN,ES,KO}` — DB `session.language` 저장값 |
| L2 | `apps/web/src/i18n/i18n.ts:82` | `SUPPORTED_LANGUAGES` | `['en','es','ko']` + 리소스 96줄 import |
| L3 | `apps/widget/src/i18n/i18n.ts:9` | `SUPPORTED_LANGUAGES` | `['en','es','ko']` |
| L4 | `apps/mobile/src/lib/config.ts:20` | `SUPPORTED_LANGUAGES` | `['en','es','ko']` |
| L5 | `apps/pwa/src/lib/config.ts:14` | `SUPPORTED_LANGUAGES` | `['en','es','ko']` |
| L6 | 타입 리터럴 8곳 | `'EN' \| 'ES' \| 'KO'` | scenario.service `Lang`, issue-notice `NoticeLang`, tenant-ai-config 4곳(handbackNotice/offHours.notice/reply/followUps), ai-config.service, web `ScenarioLang` |
| L7 | UI 상수 6곳 | `LANGS` / `COPY_LANGS` / `LANGUAGE_LABELS` | Header, LanguageSwitcher(widget), SettingsPage, ScenarioReplyEditor, HandoffSection, PreviewPanel, KnowledgeQaPanel, mobile onboarding·settings, pwa SettingsPage |

→ 언어 하나를 늘리려면 **최소 20곳**을 개별 수정해야 하며, 어느 하나를 빠뜨리면
[[invisible-fallback-trap]] 패턴 그대로 **에러 없이 조용히 EN으로 폴백**한다(현재 모든 조회가 `?? EN`).

### 1b. 번역 리소스 규모 (en 기준 키 수)
| 앱 | 파일 | 키 수 | ×3 언어 |
|---|---|---|---|
| web(콘솔) | `locales/{lang}/*.json` 24 네임스페이스 | 1,455 | 4,365 |
| widget | `locales/{lang}.ts` 단일 객체 | 170 | 510 |
| mobile | `locales/{lang}.ts` | 118 | 354 |
| pwa | `locales/{lang}.ts` | 128 | 384 |
| api(상담 문구) | 9개 파일의 `{EN,ES,KO}` 리터럴 맵 | ~45 | ~135 |
| **계** | | **1,916** | **≈ 5,750 문자열** |

백엔드 문구 맵 분포: `chat/scenario.service.ts` 25 · `chat/chat.service.ts` 7 ·
`issue/issue-notice.ts` 4 · `agent/agent.service.ts` 3 · `chat/idle-conversation.service.ts` 2 ·
`messenger/messenger-ingest.service.ts` 1 · `ai-engine/handoff-router.service.ts` 1 ·
`packages/types/domain/status-map.ts` 1(배송 4단계).

### 1c. 언어 결정(detection) 경로
| 경로 | 코드 | 현재 동작 |
|---|---|---|
| 위젯/스토어프론트 세션 | `session.service.ts:392 resolveLanguage()` | `es*`/`ko*` 접두만 인식, 그 외 → 테넌트 타임존 기본값 |
| 테넌트 타임존 기본값 | `session.service.ts:401 languageForTimezone()` | `asia/seoul→KO`, `america/*→EN`, 그 외 null |
| 외부 메신저 유입 | `messenger-ingest.service.ts:287` | `ko*→KO`, `es*→ES`, 그 외 EN |
| 콘솔/앱 UI | 각 앱 `getInitialLanguage()` | localStorage(`ivy_lang`)만, 없으면 `'en'`(브라우저 언어 미참조) |

### 1d. 언어 무관하게 이미 동작하는 것 (추가 작업 불필요)
| 항목 | 근거 |
|---|---|
| DB 스키마 | 언어 컬럼이 전부 VARCHAR — `session.language` varchar(8) DEFAULT 'EN', kb `lang` varchar(8), `answer_reuse.lang` varchar(5), moderation rule `lang` varchar(8), `agent_profile.languages` varchar(64). **ENUM 없음 → 마이그레이션 불필요** |
| LLM 응답 언어 | `rag.service.ts:358` 이 `Reply in language code: ${language}` 로 코드를 그대로 주입 — 신규 코드도 코드 수정 없이 동작 |
| KB 전문검색 | `ft_kb_title_content ... WITH PARSER ngram` — CJK(일·중)도 2-gram으로 색인됨 |
| 임베딩 | Voyage 다국어 모델 — vi/ja/zh 커버 |
| 응답 폴백 | `sysMsg()`·`deliverySteps()`·copy 맵 전부 `?? EN` — 번역 누락 시 크래시 없이 영어 |

## 2. TO-BE

1. **언어 레지스트리 단일화**: `packages/types` 에 코드·표시명(원어)·세션코드·검수여부를 담은
   단일 레지스트리를 두고, L2~L7 전부가 이를 참조한다. 이후 7번째 언어는 **레지스트리 1줄 + 번역 파일**로 끝난다.
2. 6개 언어(en/es/ko/**vi/ja/zh**)가 콘솔·위젯·모바일·PWA·백엔드 상담문구 전 표면에서 선택·표시된다.
3. 언어 전환 UI가 6개를 감당하는 형태(드롭다운)로 바뀐다 — 현재 3버튼 가로 pill 은 위젯 헤더 폭(320px)에서 파손.
4. 유입 로케일 감지가 `vi*/ja*/zh*` 를 인식하고, 타임존 기본값에 `Asia/Ho_Chi_Minh→VI`,
   `Asia/Tokyo→JA`, `Asia/Shanghai|Chongqing|Harbin→ZH` 가 추가된다.
5. LLM 초벌 번역은 **검수 대기(reviewed=false)** 로 표시되어, 사용자가 검수 상태를 한눈에 알 수 있다.
6. 번역 누락이 **조용한 EN 폴백이 아니라 검증 스크립트의 실패**로 드러난다(`npm run i18n:check`).

## 3. GAP 분석 (해결해야 할 것)

| # | 갭 | 영향 | 난이도 |
|---|---|---|---|
| **G1** | 언어 목록 5벌 중복(L1~L7, 20곳) | 누락 시 조용한 EN 폴백 | 중 — 레지스트리 도입으로 해소 |
| **G2** | 언어 전환 UI가 3개 고정폭 pill | **위젯 헤더에서 6개 넘침 → UI 파손** | 소 — 드롭다운화(⚠️ 와이어프레임 대상) |
| **G3** | 콘솔 언어별 편집 탭 5곳(위젯문구/시나리오/이관/미리보기/지식QA)이 3탭 가로 배열 | 6탭 줄바꿈·가독성 저하 | 소 (⚠️ 와이어프레임 대상) |
| **G4** | 위젯 문구 DTO가 **언어별 평면 필드**(`first_visit_en/es/ko`, `login_greeting_*` 6개) | 언어당 필드 2개씩 증식(→12개) | 소 — 이번엔 6필드 추가(가산), 중첩 DTO 리팩터는 백로그 |
| **G5** | `keyword.util.ts` 가 한국어만 2-gram, 나머지는 **공백 단위** | **일·중은 공백이 없어 문장 전체가 1토큰** → 질문 키워드 통계가 무의미해짐 | 중 — 한글 런 로직을 가나/한자 범위로 확장, vi 는 공백형+불용어 사전 |
| **G6** | `resolveLanguage`/`languageForTimezone`/메신저 힌트 매퍼가 es·ko 하드코딩 | 베트남·일본·중국 유입이 전부 EN | 소 |
| **G7** | 폰트 스택이 `'Pretendard', -apple-system, …` | Pretendard 가 한자 일부를 커버 → **일·중 한자가 한국식 자형(한자 통합 문제)으로 렌더될 수 있음** | 소 — `<html lang>` + 언어별 폰트 스택 보강 |
| **G8** | `web/i18n.ts` 가 네임스페이스×언어를 **명시 import 96줄** | 6언어면 192줄 + resources 블록 6벌 | 소 — `import.meta.glob` 로 축약(선택) |
| **G9** | 기존 테스트가 3언어 전제 (`status-map.spec`, `messenger-ingest.spec` 의 `['es-ES','ES']` 등) | 회귀 게이트 부재 | 소 |
| **G10** | 문서(`CLAUDE.md` §1/§2, `SPEC.md` §13, `.claude/skills/ivy-talktalk-dev/SKILL.md` §0)가 "en/es/ko" 로 못박음 | 이후 세션이 3언어로 오인 | 소 |
| **G11** | 번역 완전성 검사 도구 없음 | 키 누락이 배포 후 EN 노출로만 발견 | 소 — `scripts/i18n-check.mjs` 신규 |

### 참고: 기존 결함 1건 (이번 범위 밖, 별건 기록)
`apps/web/src/domain/live-chat/LiveChatPage.tsx:596` — 지식 조회가 `language: 'EN'` 하드코딩.
언어 확장과 무관한 기존 버그이며, PLN 단계에서 곁다리 수정 여부를 결정한다.

## 4. 사용자 플로우 (변경분)

```
[쇼퍼] 위젯 오픈
  └ 세션 생성 시 navigator.language='vi-VN' → resolveLanguage → VI (G6 해결 후)
     └ 위젯 UI 베트남어 + AI 응답 베트남어(rag 프롬프트 language=VI, 코드변경 없음)
        └ 헤더 언어 드롭다운에서 6개 중 선택 → 세션 언어 서버 반영(setSessionLanguage)

[운영자] 콘솔 로그인
  └ 헤더 언어 드롭다운(6개, 검수 대기 언어는 β 표시)
     └ 설정>위젯문구 / AI설정>시나리오·이관 문구 탭에서 6개 언어별 문구 편집
```

## 5. 제약 · 결정 필요

| # | 항목 | 내용 |
|---|---|---|
| **D1** | 중국어 코드 표기 | **권장: `zh` (= 간체 zh-Hans)**. 이유 — 위젯 스위처가 `i18n.language.split('-')[0]` 로 활성 판정하고 `keyword.util` 이 `slice(0,2)` 를 쓰며 `answer_reuse.lang` 이 varchar(5) 라, `zh-CN` 표기는 3곳을 함께 손봐야 한다. 대신 **번체가 필요해지면 `zh-TW` 를 별도 코드로 추가**(i18next 가 미등록 시 `zh` 로 폴백하므로 대만 유입은 그때까지 간체 노출) |
| **D2** | 세션 언어 저장값 | `VI` / `JA` / `ZH` (기존 EN/ES/KO 와 동일한 2글자 대문자, varchar(8) 수용) |
| **D3** | 번역 방식 | 사용자 확정: **LLM 초벌 + 검수 대기 표시**. 초벌은 커밋에 포함해 즉시 배포 가능, 검수 항목은 TCR 에 체크리스트로 남김 |
| **D4** | 검수 대기 표시 위치 | 레지스트리의 `reviewed:false` → 언어 선택 UI 에 β 배지 + 콘솔 언어 선택 시 툴팁. 쇼퍼용 위젯에는 배지 노출 여부를 PLN 에서 결정 |
| **D5** | 스키마 | **변경 없음** (§1d) — 마이그레이션 SQL·PR `## Migration` 섹션 불필요 |
| **D6** | 모바일 앱 | RN/Expo 앱은 스토어 미제출 상태이므로 코드만 반영, 배포 검증 대상 아님 |

## 6. 비기능 · 리스크

- **회귀 리스크 낮음**: 모든 조회 경로가 `?? EN` 폴백을 이미 갖고 있어, 신규 언어 리소스가 부분적이어도 기존 3언어 동작은 불변.
- **최대 리스크는 G2/G3 UI 파손** — 언어 3→6 은 "값만 늘리면 되는 변경"으로 보이지만 고정폭 pill 행이 실제로 깨진다. 반드시 실화면 확인 필요.
- **두 번째 리스크는 G5** — 일·중 키워드 통계가 조용히 쓰레기값을 쌓는다(에러 없음). 배포 후에는 발견이 어렵다.
- 번역 5,750 문자열은 **단일 PR 로 올리면 리뷰 불가** → PLN 에서 앱 단위로 분할.

## 7. 설계 ID 매핑
- 확장 대상: FR-i18n(다국어), FN-005(세션 언어), FN-009(시나리오), FN-040(AI 설정 문구), SCR-공통 헤더/설정/AI설정
- 신규 산출물: `packages/types` 언어 레지스트리, `scripts/i18n-check.mjs`

## 8. 다음 단계
`docs/plan/PLN-260817-Multilang-VI-JA-ZH.md` (단계별 계획 + G2/G3 ASCII 와이어프레임) 작성 → **사용자 승인 후 구현**.

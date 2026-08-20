# REQ-260820-Multi-AI-Agent-Personas

복수 AI 상담 에이전트 · 에이전트별 페르소나 (요구사항 분석)

- 요청일: 2026-08-20
- 요청 요지: `/ai-setting`에서 AI 상담 에이전트를 **복수 등록**하고 각 에이전트에 **별도 페르소나**를 부여할 수 있어야 한다. 상황(고객 유형·진입 경로)에 따라 다른 에이전트가 배정되어야 한다.
- 예시 시나리오(최소 4개): ① 웹/앱 예약고객용 프론트 랜딩페이지 방문고객 대응 ② 고투조이 어드민 내부 직원 채팅 대응 ③ 호텔 파트너사 대응 ④ 광고협력사 질문 대응. (그 외 외국인 전문, 노약자 대응 등 확장 가능해야 함)

## 1. AS-IS

### 1.1 데이터 모델 — 페르소나는 테넌트당 1개로 고정
- `tenant_ai_config` (`apps/api/src/domain/ai-engine/entity/tenant-ai-config.entity.ts`):
  `@Unique('uk_aiconfig_tenant', ['tenantId'])` — **테넌트 1 : 설정 1행** 하드 제약.
  컬럼: `persona TEXT`, `rules JSON(string[])`, `scenario_buttons JSON`, `scenario_overrides JSON`, `handoff_config JSON`.
- 모델/파라미터(`temperature`, `max_tokens`)는 별도 테이블 `tenant_ai_settings`(기능별 엔진 라우팅) 소관 — 페르소나와 무관.
- 페르소나 소비 핫패스: `AiConfigService.getPersonaRules(tenantId)` (Redis 캐시 `aicfg:persona:${tenantId}`, TTL 60s) → `RagService.answer()`의 시스템 프롬프트 조립(`rag.service.ts:341`). 시그니처에 에이전트 차원이 없음.
- 페르소나를 **쓰는** 소비처 전수: RAG 답변, 지식 QA 테스트 답변, 시나리오 응답, 위젯 시나리오 버튼(공개), 핸드오프 라우팅, 이슈 SLA, 핸드백 안내문, **AI 코치(읽기+페르소나 갱신 쓰기)**, 콘솔 read/write, 시드.

### 1.2 콘솔 API/UI — 전부 싱글턴
- `GET/PUT /ai-config`: 경로 파라미터 없음, JWT의 테넌트로만 식별 → 구조적으로 1개.
- `/ai-setting` 페이지(`AiSettingsPage.tsx`): PersonaSection(단일 textarea) + 규칙/시나리오/기능·엔진/모더레이션/답변재사용 카드 나열. 우측 레일에 미리보기/코칭 탭.
- 핸드오프 UI는 이미 `/settings`로 이동해 있음(테넌트 수준 설정으로 취급 중).

### 1.3 배정(라우팅) 컨텍스트 — 존재하지 않음
- `sessions`: `channel`(preview/메신저 provider), `tenant_id`, `language` 뿐 — **진입점·에이전트 식별 컬럼 없음**.
- 위젯 embed(`apps/widget/public/embed.js`): iframe에 `shop`, `locale`, GA4, UTM만 전달 — 에이전트 파라미터 없음.
- 메신저 채널(`messenger_channels`): 테넌트당 복수 행(provider+label), `config JSON` 보유 — 채널별 에이전트 바인딩을 얹을 자리는 있음.
- `conversations.agent_id`는 **사람 상담원**(`agents` 테이블) FK — AI 에이전트와 이름 충돌 주의.

### 1.4 참고 가능한 기존 패턴
- 테넌트당 복수 설정 행 CRUD: `messenger_channels` 모듈(리스트/upsert/patch/delete/test, 라벨로 구분).
- 명시→상속→테넌트 기본→플랫폼 기본 폴백 해석: `AiGatewayService.resolveRouting()` + `ROUTING_SOURCE` 노출 방식.

## 2. TO-BE

1. **에이전트 복수 등록**: 테넌트가 AI 에이전트를 N개 등록(이름·코드·페르소나·응답규칙·활성 여부), 그중 1개를 **기본(default)** 지정.
2. **에이전트별 페르소나 격리**: RAG 답변 시스템 프롬프트가 세션에 배정된 에이전트의 페르소나/규칙을 사용. 미배정/미매칭 시 기본 에이전트로 폴백(현행과 동일 동작 보장).
3. **배정 규칙 — 진입점 기반(결정적)**:
   - 위젯 설치 스니펫에 `agent="<code>"` 지정 → 그 페이지에서 열린 세션은 해당 에이전트 고정. (랜딩페이지/어드민/파트너 포털/광고협력사 페이지에 서로 다른 코드로 설치하면 예시 4종이 충족됨)
   - 메신저 채널별 바인딩: `messenger_channels`에 에이전트 지정 → 그 채널 인바운드 대화는 해당 에이전트.
   - 콘솔 미리보기: 에이전트 선택 후 미리보기.
4. **콘솔 UI**: `/ai-setting`에 에이전트 목록(마스터) + 선택 에이전트의 페르소나/규칙 편집(디테일). 기본 에이전트 표시·전환. 저장/삭제 토스트(무음 성공 금지), i18n 6개 언어.
5. **AI 코치 정합**: 코칭 제안이 "어느 에이전트의 페르소나"를 고치는지 명시 — 코치 스레드/제안에 에이전트 차원 추가.

### 범위 제외 (적정기술 — 이번에 안 함)
- 대화 내용(의도) 기반 자동 에이전트 전환/핸드오버 — 진입점 결정 방식으로 충분하며, 오배정 리스크·복잡도 대비 가치가 낮음. 필요 시 후속.
- 에이전트별 엔진/모델/파라미터 분리(`tenant_ai_settings`의 에이전트 차원화) — 페르소나 분리만으로 요구 충족. 후속 후보.
- 에이전트별 시나리오 버튼·핸드오프·모더레이션 — **테넌트 수준 유지**(핸드오프 UI가 이미 /settings로 분리된 방향과 일치).

## 3. 갭 분석

| # | 갭 | AS-IS | TO-BE |
|---|-----|-------|-------|
| G1 | 저장 구조 | `tenant_ai_config` 1행에 persona+rules 포함 | 신규 `ai_agents` 테이블(테넌트당 N행) — persona/rules 이관, 나머지 필드는 잔류 |
| G2 | 해석/캐시 | `getPersonaRules(tenantId)`, 캐시 키 테넌트 단독 | `(tenantId, aiAgentId?)` — 캐시 키에 에이전트 세그먼트, 기본 폴백 |
| G3 | 세션 배정 | 세션에 에이전트 개념 없음 | `sessions.ai_agent_id`(nullable=기본) + embed `agent` 파라미터 + 메신저 채널 바인딩 |
| G4 | 파이프라인 | `rag.answer(tenantId,…)` 에이전트 무지 | 세션→에이전트 해석을 `handleUserMessage`에서 1회, rag까지 전달 |
| G5 | 콘솔 | 싱글턴 편집 화면 | 에이전트 목록+편집, 기본 지정, 미리보기 에이전트 선택 |
| G6 | 코치 | 테넌트 페르소나에 직접 적용 | 스레드·제안에 `ai_agent_id`, 선택 에이전트 대상 적용/되돌리기 |

## 4. 사용자 흐름

### 4.1 운영자 (테넌트 콘솔)
1. `/ai-setting` → 에이전트 목록에서 `+ 에이전트 추가` → 이름("호텔 파트너사 담당")·코드(`hotel-partner`)·페르소나·규칙 입력 → 저장(토스트).
2. 설치 안내에서 해당 에이전트의 embed 스니펫(`data-agent="hotel-partner"`)을 복사해 파트너 포털에 설치.
3. 미리보기 패널에서 에이전트를 골라 답변 톤 확인. 코칭 탭에서도 대상 에이전트를 선택해 개선.

### 4.2 최종 사용자
- 파트너 포털 방문자가 위젯 오픈 → 세션 생성 시 `agent=hotel-partner` 배정 → 이후 모든 AI 답변이 그 페르소나로 생성. 미지정 페이지/기존 설치분은 기본 에이전트(현행 페르소나와 동일) — **무회귀**.

## 5. 제약·전제

- C1. 기존 테넌트 무회귀: 마이그레이션이 각 테넌트의 현행 persona/rules를 기본 에이전트 행으로 백필. embed 스니펫 미변경 설치분은 기본 에이전트로 동작(현행과 동일).
- C2. 스테이징 `DB_SYNCHRONIZE=false` — `sql/` 수동 선적용 필수, PR에 `## Migration` 섹션.
- C3. 명명 충돌: `agents` 테이블(사람 상담원)·`conversations.agent_id`(사람) 존재 → 신규 테이블 `ai_agents`, 컬럼 `ai_agent_id`로 구분.
- C4. 모더레이션 게이트(FR-069/POL-020)는 에이전트와 무관하게 전 출력에 유지.
- C5. 페르소나 4000자 상한(코치 `RULE_LIMITS`) 에이전트별로 동일 적용.
- C6. i18n 6개 언어(en/es/ko/vi/ja/zh), `npm run i18n:check` 통과.
- C7. 위젯 embed 파라미터는 신뢰 경계가 아님 — `agent` 코드는 해당 테넌트의 **활성 에이전트 코드일 때만** 유효, 불일치 시 기본 폴백(오류 아님). 크로스테넌트 코드 지정 불가.
- C8. 예시 4종 에이전트(랜딩/어드민/호텔/광고)는 코드가 아니라 **운영 데이터** — 배포 후 콘솔에서 등록(초안 페르소나는 PLN 부록으로 제공).

## 6. 에러코드

신규 블록 **E5040~** 할당 예정(E5029 이후 미사용 확인, E503x는 AMA SSO 예약 가능성으로 회피 — 구현 시 `error-code.constant.ts` 재확인).

## 7. 결론

핵심 작업은 ① `ai_agents` 테이블 신설+백필, ② 세션 배정 축(`ai_agent_id`) 신설(embed·메신저 채널·미리보기 3경로), ③ 페르소나 해석 경로의 에이전트 차원화(3-hop 시그니처 변경), ④ 콘솔 마스터/디테일 UI, ⑤ 코치 정합. 기존 `messenger_channels`(복수 행 CRUD)와 `resolveRouting`(기본 폴백) 패턴을 그대로 차용하면 오버엔지니어링 없이 달성 가능. 상세 단계·와이어프레임은 `PLN-260820-Multi-AI-Agent-Personas.md`.

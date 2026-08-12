# RPT-260804 — 에이전트 코칭 대화창 구현 보고 (W1+W2)

- 선행: `docs/analysis/REQ-260804-Agent-Coaching-Chat.md` · `docs/plan/PLN-260804-Agent-Coaching-Chat.md`
- 테스트: `docs/test/TCR-260804-Agent-Coaching-Chat.md`
- 범위: **W1(백엔드) + W2(프론트엔드)** — 승인된 1차 PR 범위. W3(시뮬레이션 연동·KB 제안)/W4(회귀 검증)는 후속.

---

## 1. 무엇을 만들었나

`/ai-setting` 우측 패널이 탭 2개가 되었다.

| 탭 | 관리자 역할 | 에이전트 역할 | 저장 |
|---|---|---|---|
| 고객 시뮬레이션 (기존) | 고객 | 상담원 | `sessions(channel='preview')` |
| **에이전트 코칭 (신규)** | **수퍼바이저** | 피드백 받는 본인 | `agent_coaching_*` 3종 |

코칭 응답은 `{답변 텍스트 + 제안 카드[]}`다. 관리자가 `적용`을 눌러야만 `tenant_ai_config`에 반영되며,
적용은 기존 `AiConfigService.upsertConfig`에 위임하므로 **persona Redis 캐시 무효화가 자동으로 따라온다.**

---

## 2. 변경 파일

### 신규 (백엔드)
```
apps/api/src/domain/ai-coach/
  entity/coaching-thread.entity.ts        agent_coaching_threads
  entity/coaching-message.entity.ts       agent_coaching_messages
  entity/coaching-proposal.entity.ts      agent_coaching_proposals
  dto/request/ai-coach.request.ts         snake_case 요청 DTO 4종
  coach-context.service.ts                FN-054 컨텍스트 조립 + 코칭 지시문
  coach-proposal.service.ts               FN-055/056 파싱·적용·되돌리기
  ai-coach.service.ts                     스레드 CRUD + 턴 파이프라인
  ai-coach.mapper.ts                      camelCase 응답 매퍼
  ai-coach.controller.ts                  /ai-coach 8개 라우트
  ai-coach.module.ts
  coach-proposal.service.spec.ts          단위 테스트 13건
sql/migration_agent_coaching.sql
```

### 신규 (프론트엔드)
```
apps/web/src/domain/ai-settings/
  AiStudioPanel.tsx    탭 셸 (PreviewPanel을 무수정으로 감쌈)
  CoachPanel.tsx       스레드 선택 · 대화 · 참조 턴 · 입력
  ProposalCard.tsx     제안 카드 5상태 + 수정 후 적용 모달
  coach.service.ts     API 클라이언트
  coach.hooks.ts       React Query 훅
```

### 수정
| 파일 | 변경 |
|---|---|
| `packages/types/src/common/enum.types.ts` | `AI_FUNCTION.COACH = 'coach'` |
| `apps/api/src/domain/ai-engine/dto/request/ai-engine.request.ts` | `AI_FUNCTIONS`에 `'coach'` |
| `apps/api/src/database/seed.runner.ts` | 동일 |
| `apps/api/src/global/constant/error-code.constant.ts` | **E4012~E4015** 추가 |
| `apps/api/src/app.module.ts` | `AiCoachModule` 등록 |
| `apps/web/.../AiSettingsPage.tsx` | `<PreviewPanel/>` → `<AiStudioPanel/>` (3줄) |
| `apps/web/src/i18n/locales/{en,es,ko}/aiSetting.json` | `coach.*` 36키 + `functions.coach` |

---

## 3. 설계상 중요한 결정과 근거

**① 자동 반영 없음 — 제안·승인만.** 상용 서베이(REQ §13.1)에서 확인: Intercom Fin Operator
*"never publishes, deletes, or modifies content directly"*, Decagon Autopilot *"every change requires
human approval"*. 자동 반영하는 벤더는 하나도 없다. persona 한 줄이 전 고객 응대를 즉시 바꾸는데
되돌릴 스냅샷이 없던 기존 상태를 감안하면, 승인 게이트가 곧 제품 신뢰성이다.

**② 고객 대화 테이블을 재사용하지 않음.** `conversations`/`messages`에 `channel='coaching'`을
얹는 대신 별도 테이블 3종을 만들었다. 내부 운영 대화가 상담 히스토리·분석·**DSAR/삭제 대상 스캔**에
섞이는 것을 막기 위해서다(프리뷰 세션이 히스토리에 노출되는 기존 결함과 같은 종류의 사고).
코칭에는 고객 세션 자체가 없다는 구조적 이유도 있다.

**③ 규칙은 인덱스가 아니라 텍스트로 지목.** 제안 시점과 적용 시점 사이에 설정이 움직일 수 있다.
인덱스 기반이면 그 사이 규칙 하나가 삽입되는 것만으로 **엉뚱한 규칙을 조용히 덮어쓴다.**
매칭 실패는 `E4015`로 명시적으로 거부한다 (테스트 T-07/T-08).

**④ 파싱 실패는 "제안 없음"으로 폴백.** tool_use 대신 JSON 블록 규약을 썼다 — 게이트웨이가 어댑터
오류 시 stub으로 폴백하는 구조에서 tool_use는 무키 개발 환경을 깨뜨린다. 깨진 JSON을 복구하지 않는
것이 핵심이다: 복구하면 아무도 제안하지 않은 규칙이 승인 한 번으로 반영된다.

**⑤ 진단은 저장된 사실에서만.** LLM의 사후 자기설명은 실제 근거와 어긋난다는 연구가 있다
([Turpin et al. 2023](https://arxiv.org/abs/2305.04388)). "왜 그렇게 답했나"를 모델 성찰로 만들면,
운영자가 **틀린 설명을 믿고 엉뚱한 곳을 고친다.** 그래서 confidence/인용/유사도는 전부 저장된
`retrieval_trace` 값에서 오고, UI도 모델 문장이 아니라 DB 값을 직접 렌더링한다.

**⑥ 사실은 규칙이 아니다.** Salesforce가 안티패턴으로 명시한 사례("30일 초과 환불 금지"를 지시문으로
쓰는 것)를 코칭 시스템 프롬프트에서 직접 금지했다. W1에는 `kb_upsert`가 없으므로 사실성 피드백에는
제안을 만들지 말고 "지식 문서가 필요하다"고 안내만 하도록 지시했다.

**⑦ 규칙 예산 40개 / 각 500자.** Intercom 100·Ada 10·Zendesk 40·Salesforce 5~10을 참고한 중간값.
append 전용 코칭은 몇 주면 예산을 소진하므로, 유사 규칙이 있으면 `rule_edit`을 내도록 지시했다.

---

## 4. 테스트 결과

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **13/13 통과** (파싱 4 · 적용 7 · 되돌리기 2) |
| 전체 스위트 | **452 tests / 43 suites 통과** (기존 439 무회귀) |
| 모노레포 typecheck | ✅ 9 tasks |
| 실기동 | ✅ `Nest application successfully started` — 엔티티 3종 DataSource 초기화 정상 |
| 라우트 | ✅ `/api/v1/ai-coach` 8개 Mapped, 미인증 **401** |
| E2E(로컬) | ✅ 스레드 생성 → 코칭 턴(KB 인용 4건·모더레이션 통과) → 제안 적용 → `/ai-config` 즉시 반영 |
| 마이그레이션 SQL | ✅ 로컬 적용 성공, 재실행 안전 |
| `npm run lint` | ⚠️ 실패 — **기존 결함**(clean tree에서도 ESLint 설정 부재로 동일 실패). 본 변경 무관 |

⚠️ **실 LLM 경로는 미검증**이다. 로컬에 Anthropic 키가 없어 코칭 응답이 전부 stub이었고, 따라서
제안이 실제로 생성되는 경로는 스테이징에서 확인해야 한다 (TCR §3의 U-01~U-06).
그중 **U-02(사실을 규칙으로 인코딩하지 않는가)가 배포 후 최우선 확인 항목**이다.

---

## 5. 배포 상태

| 항목 | 값 |
|---|---|
| 브랜치 | `feature/agent-coaching-chat` |
| PR | [#99](https://github.com/KimIgyong/ivyusa-shopping-talktalk/pull/99) — squash merge |
| 커밋 SHA | **`0c2d8db`** (main) |
| 로컬 | ✅ 검증 완료 (검증용 DB 변경은 전부 원복) |
| 스테이징 | ✅ **배포 완료 2026-08-04** — 마이그레이션 선적용 → 코드 배포 → 검증 |
| 프로덕션 | ⬜ (호스트 미확보, 기존 상태) |

### 스테이징 배포 기록 (2026-08-04)

순서: PR 머지 → 서버 `git pull` → **SQL 선적용** → `deploy-staging.sh` → 검증.

| 검증 | 결과 |
|---|---|
| 마이그레이션 | ✅ 테이블 3종 생성, `agent_coaching_proposals` 컬럼 스펙 일치 |
| 부팅 로그 | ✅ `Nest application successfully started` + `AiCoachController {/api/v1/ai-coach}` |
| 스키마 오류 | ✅ 없음 (`doesn't exist` / `Unknown column` 미검출) |
| 컨테이너 | ✅ `ivy_api_staging` 재생성 후 healthy |
| 신규 라우트 | ✅ `GET/POST /api/v1/ai-coach/threads` → **401** (배포됨) |
| 기존 라우트 회귀 | ✅ `/ai-config` 401, `/health` 200, `/ai-setting` 200 |
| 프론트 번들 | ✅ lazy 청크 `AiSettingsPage-*.js`에 코칭 클라이언트 코드·문구 포함, i18n 3개 로케일 메인 번들 반영 |

### ⚠️ 배포에서 드러난 것 2건 → **둘 다 해결 (PR #102, `7c2a493`, 스테이징 재배포 완료)**

수정 상세와 예방 패턴은 `docs/bug-fix/FIX-260804-Silent-Stub-Routing.md`.
핵심은 D-1이 coach 고유 문제가 아니라 **테넌트 프로비저닝 이후 추가되는 모든 기능**에 해당한다는 점이었다:
설정 목록 API가 저장된 행만 반환해서, enum에 값을 더하는 순간 그 값은 화면에서 사라지고 조용히 폴백했다.
이제 `list()`가 정의된 전체 기능을 반환하고(미설정 포함, 실제 엔진·출처 동반), `coach`는 rag→chat을
상속하며, 코칭 패널은 stub일 때 경고 배너를 띄운다(설정값 + 실제 응답 provider 양쪽 확인).
스테이징은 수동 삽입했던 `coach` 행을 지우고 재배포해 **상속만으로** Anthropic에 연결됨을 확인했다.

**D-1. `coach` 엔진 라우팅이 없으면 조용히 stub으로 떨어진다.**
배포 직후 `tenant_ai_settings`에 tenant 1의 `coach` 행이 없었다. 플랫폼 기본 엔진이 stub(`is_default=1`)이라
게이트웨이 폴백이 **stub으로 귀결**되고, 그러면 코칭은 제안을 한 건도 만들지 못한 채 "고장난 것처럼" 보인다.
설계상 의도된 폴백이지만 **실사용 결과가 나쁘다.** 배포 시 tenant 1의 `coach`를 다른 기능과 같은
엔진 2(Anthropic `claude-opus-4-8`)로 지정해 해소했다. 관리자가 AI functions 섹션에서 바꿀 수 있다.
→ 신규 테넌트에도 같은 함정이 있다. 시드/온보딩에서 `coach` 기본 라우팅을 넣는 것을 후속 과제로 둔다.

**D-2. PLN W2의 "stub 엔진 경고 배너"를 구현하지 않았다.**
계획에 있었으나 `CoachPanel.tsx`에 들어가지 않았다. D-1과 정확히 맞물리는 누락이다 — 배너가 있었다면
운영자가 stub 상태를 즉시 알았을 것이다. **후속 PR에서 반드시 추가**한다.

### ⚠️ 마이그레이션 (코드 배포 **전** 필수)

스테이징은 `DB_SYNCHRONIZE=false`다. 테이블이 없으면 `/ai-coach` 전 라우트가 500이 된다.

```bash
# 1) SQL 선적용
docker exec -i ivy_mysql_staging mysql -u<user> -p<pass> <db> < sql/migration_agent_coaching.sql
# 2) 확인
SHOW TABLES LIKE 'agent_coaching%';   -- 3개
# 3) 코드 배포 → 부팅 로그 'successfully started' + GET /api/v1/ai-coach/threads 가 401
```
롤백: 코드만 되돌리면 된다. 신규 테이블은 기존 기능이 참조하지 않으므로 남겨둬도 무해하다
(`DROP TABLE agent_coaching_proposals, agent_coaching_messages, agent_coaching_threads;`).

`tenant_ai_settings.function`에 `'coach'` 값이 추가되지만 **스키마 변경은 없다**(`varchar(16)`).
미설정 테넌트는 게이트웨이 기존 폴백으로 동작한다.

---

## 6. 후속 작업

| # | 항목 | 시점 |
|---|---|---|
| ~~1~~ | ~~U-01~U-06 실 LLM 검증~~ → **2026-08-13 완료, 6/6 통과** (TCR §3) | ✅ |
| ~~2~~ | ~~D-1/D-2~~ → **완료** (PR #102, FIX-260804-Silent-Stub-Routing) | ✅ |
| 3 | W3 — 시뮬레이션 버블 [코칭] 연동, `kb_upsert`·`scenario_override` 제안 | 다음 PR |
| 4 | W4 — 골든 질문 회귀 검증, persona 개정 이력 | 이후 |
| 5 | 규칙별 성과 측정(사용 횟수·해결률) — Intercom만 보유한 기능, 차별화 여지 | 백로그 |
| 6 | ESLint 설정 부재(기존 결함) 해소 | 별도 |

### 실 LLM 검증 결과 (2026-08-13, 스테이징)

사용자로부터 콘솔 계정 비밀번호를 받아 실행했다. 상세는 `docs/test/TCR-260804-Agent-Coaching-Chat.md` §3.
**U-01~U-06 전부 통과**, 응답은 모두 `provider=anthropic`, **제안은 하나도 승인하지 않았고**
검증 전후 persona·rules(10건) 동일함을 대조 확인했다.

가장 중요한 결과 둘:

- **U-02(사실→규칙 금지)** — 제안 0건으로 통과했을 뿐 아니라, 관리자가 말한 "환불 30일"이
  기존 문서 `[policy_return 2.2.7]`의 "영업일 10일"과 어긋난다는 것을 **스스로 찾아내 되물었다.**
  사실 주입 차단 + 기존 지식과의 모순 사전 검출까지 동작한다.
- **U-05(근거 기반 진단)** — 모델이 말한 수치가 `retrieval_trace` 저장값과 정확히 일치했고
  (0.5/인용 0건, 0.614/`2.1.2 Estimated Delivery Time`), 근거를 넘어서는 주장은 **스스로 거부**했다
  ("숫자가 문서 실제 값과 맞는지는 주어진 수치만으로 확인 불가"). REQ §3.5 제약이 실효한다.

남은 다듬을 거리 하나: 제안이 없을 때 "제안은 없습니다"류 메타 문장이 붙고, 한 번은 관리자 언어와
무관하게 **영어로** 나왔다. 불필요한 문장이므로 프롬프트에서 제거하는 편이 낫다(결함 아님).

# PLN-260808-Widget-Greetings-EndChat-AnswerReuse

위젯 문구 설정화(A) · 상담종료(B) · 유사질문 답변 재사용(C) 작업계획서.

- 작성일: 2026-08-08 · 근거: REQ-260808-Widget-Greetings-EndChat-AnswerReuse (결정 D-A1~D-C3 반영)
- ⚠️ **사용자 승인 후 구현 착수**
- 구현 순서: **A → B → C** (A는 "타 테넌트가 IVY USA로 인사받는" 현결함 수정 포함이라 최우선)

---

## 트랙 A — 위젯 문구 설정화 (PR-A)

### A-1. 저장소 (SQL 1건)
`sql/260808-tenant-widget-copy.sql`:
```sql
ALTER TABLE `tenants` ADD COLUMN `widget_copy` JSON NULL AFTER `widget_login_mode`;
```
JSON 스키마(엔티티는 string 컬럼 + 파서, 이후 문구 추가 시 마이그레이션 불필요):
```json
{ "displayName": "IVY USA",
  "firstVisit":    { "EN": "...", "ES": "...", "KO": "..." },
  "loginGreeting": { "EN": "Welcome back, {name}!…", "KO": "{name}님 반갑습니다. 무엇을 도와드릴까요?" } }
```
- 미설정 필드는 폴백: displayName→`Tenant.name`, 문구→위젯 i18n 기본문(**브랜드명은 문장에서 제거하고 {shop} 치환**).

### A-2. 백엔드
- `tenant.mapper.ts` `toWidgetSettings`/`PATCH /tenants/widget-settings` DTO에 `widget_copy` 추가(snake_case 요청 → camel 응답, EN/ES/KO 각 500자 제한 검증).
- `/session/ensure` 응답(`privacyNotice()` 번들)에 `widgetCopy`(displayName+firstVisit+loginGreeting, 세션 언어 문구만이 아닌 전체 — 위젯이 언어 전환 시 재사용) 추가.

### A-3. 위젯
- 헤더(`WidgetPanel.tsx:56`): "알림 센터" → `displayName`(폴백 tenant name) 표시.
- 첫 방문 안내(D-A3 신규 세션 1회): `/session/ensure`가 **새 세션을 만든 경우에만** 환영 버블 표시.
  세션 생성 여부 플래그를 응답에 추가(`isNew`)하거나 localStorage `ivy:greeted:{sessionToken}`로 1회 제어 — 구현 시 응답 플래그 우선.
- 로그인 인사(D-A1 저장 안 함): `customerName` null→값 전환 시 렌더 전용 버블로 `loginGreeting` 템플릿({name} 치환) 1회 표시.
- i18n 기본문에서 "IVY USA" 하드코딩 제거({shop} 치환 변수화) — **현결함 수정**.

### A-4. 콘솔 (/settings 위젯 카드 확장)
```
┌─ 위젯 설정 ──────────────────────────────────────────┐
│ 로그인 방식 [redirect ▾]   시간대 [Asia/Seoul ▾]      │
│──────────────────────────────────────────────────────│
│ 표시 이름   [ IVY USA                    ]  ← 헤더/문구 {shop} │
│ 첫 방문 안내문구            [EN][ES][KO] 탭            │
│ ┌──────────────────────────────────────────────┐    │
│ │ 안녕하세요! {shop}입니다. 무엇을 도와드릴까요?  │    │
│ └──────────────────────────────────────────────┘    │
│ 로그인 인사말 ({name} 사용 가능)   [EN][ES][KO] 탭     │
│ ┌──────────────────────────────────────────────┐    │
│ │ {name}님 반갑습니다. 무엇을 도와드릴까요?       │    │
│ └──────────────────────────────────────────────┘    │
│                        [저장]  ← 성공/실패 토스트     │
└──────────────────────────────────────────────────────┘
```

## 트랙 B — 상담종료 (PR-B, 스키마 변경 없음)

### B-1. 백엔드
- `POST /chat/end` `@Public`(세션 토큰): 해당 세션의 open 대화 → `status=ENDED, endedAt`; 상담원 배정 중이면
  `agent_assignments` release(기존 `AgentService.end` 로직과 동일 처리). open 대화 없으면 no-op 200.
- 거절 케이스에 `logger.warn`(4xx 미로깅 함정 예방). 종료 후 다음 메시지 = 새 대화(기존 시맨틱, 코드 변경 없음).

### B-2. 위젯
```
┌─ IVY USA ─────────────── [상담 종료] ✕ ┐   채팅 탭 상단 우측 텍스트 버튼
│  …대화…                                │
│  ┌────────────────────────────────┐   │   버튼 클릭 시 인라인 확인:
│  │ 상담을 종료할까요? [종료] [취소] │   │
│  └────────────────────────────────┘   │
│  ── 상담이 종료되었습니다 ──           │   ← 시스템 표시(저장 안 함·렌더 전용)
│  [메시지 입력............] [전송]      │   ← 입력 유지; 전송 시 새 상담 자동 시작
└────────────────────────────────────────┘
```
- 상담원이 종료한 경우: 폴링 status='ended' 수신 시 동일한 "상담이 종료되었습니다" 표시(FR-B3).
- i18n 3키(en/es/ko): endChat / endConfirm / endedNotice.

## 트랙 C — 답변 재사용 (PR-C1 백엔드, PR-C2 콘솔)

### C-1. 저장소 (SQL 1건 + Qdrant 컬렉션)
`sql/260808-answer-reuse.sql`:
```sql
CREATE TABLE `answer_reuse` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT NOT NULL, `lang` VARCHAR(5) NOT NULL,
  `question_text` VARCHAR(500) NOT NULL,          -- PII 스크럽본
  `answer_text` TEXT NOT NULL,                    -- 콘솔에서 편집 가능(D-C3)
  `source` VARCHAR(8) NOT NULL,                   -- agent | ai
  `source_message_id` BIGINT NULL, `confidence` DECIMAL(4,3) NULL,
  `citations` JSON NULL, `active` TINYINT(1) NOT NULL DEFAULT 1,
  `hit_count` INT NOT NULL DEFAULT 0, `last_hit_at` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP, `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_reuse_tenant` (`tenant_id`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
- Qdrant 컬렉션 `reuse_questions`(질문 임베딩, payload: tenant_id/reuse_id/lang/active) — 기존 `QdrantService` 패턴 복제(컬렉션명 파라미터화).

### C-2. 적재 (ingest — 비동기·비치명, 응답 경로 지연 없음)
- **AI 답변**: 모더레이션 DELIVERED + `confidence ≥ REUSE_MIN_CONFIDENCE(0.75)` + citations ≥ 1 + `!intent.needsOrderData` + 실엔진(스텁 제외) → 후보.
- **상담원 답변**: 상담원 회신 시 직전 고객 질문과 쌍으로 후보(최소 길이 20자, 인사말류 제외).
- 공통: 질문·답변 PII 스크럽 통과분만 저장, 기존 유사 항목(≥0.95)은 hit만 갱신(중복 방지), 테넌트당 상한(예 2,000행, 초과 시 미적재+로그).

### C-3. 조회 (lookup — `chat.service.ts:332` RAG+LLM 호출 직전)
```
질문 스크럽 → embed(1회) → reuse_questions 검색(tenant+lang+active)
  ├─ top1 ≥ REUSE_THRESHOLD(0.92) → answer_reuse 행 로드(active 확인)
  │    → RagAnswer 합성{text, confidence, citations} → (기존) 모더레이션 → 응답
  │    → trace.answeredFrom='reuse', hit_count++, D-C2: 고객 무표기
  └─ 미스/비활성/스텁 테넌트 → 기존 RAG+LLM 경로 그대로
```
- 임베딩 실패·Qdrant 장애 시 **무조건 LLM 경로로 폴백**(기능 저하 없음). env: `ANSWER_REUSE_ENABLED`(기본 on), 임계값 2종.
- 무효화: hit 시 `updated_at` 기준 TTL(기본 30일) 초과 항목은 스킵+비활성 처리(FR-C5 최소구현). KB 대량 갱신 시 콘솔에서 일괄 비활성 버튼.

### C-4. 콘솔 관리 UI (PR-C2 — /ai-setting "답변 재사용" 탭)
```
┌─ 답변 재사용 (128건 · 이번달 재사용 응답 342회) ─ [전체 비활성화] ┐
│ [검색.......]                          [활성만 ▾]              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Q: 배송은 얼마나 걸리나요?         (agent · 히트 41) [ON] │   │
│ │ A: 영업일 기준 2~3일 내 출고되며…            [편집] [삭제] │   │
│ ├────────────────────────────────────────────────────────┤   │
│ │ Q: 립 틴트 색상 추천해주세요        (ai 0.86 · 히트 12)[ON]│   │
│ │ …                                                       │   │
│ └────────────────────────────────────────────────────────┘   │
│  [편집] 클릭 → 답변 textarea 인라인 편집 → [저장] (D-C3)       │
└──────────────────────────────────────────────────────────────┘
```
- API: `GET/PATCH/DELETE /admin/answer-reuse`(캐퍼빌리티: AI 설정과 동일 축), PATCH로 answer_text 편집·active 토글. 편집 저장 시 성공/실패 토스트.

## 사이드 임팩트

| 영역 | 영향 | 판단 |
|---|---|---|
| 기존 테넌트 위젯 | 문구 미설정 시 폴백 기본문({shop}=Tenant.name) — 문면만 브랜드 변수화 | 안전(오히려 현결함 수정) |
| /session/ensure 응답 | 필드 추가만(하위호환) | 안전 |
| 상담원 콘솔 | 고객 종료 시 배정 release — 기존 end와 동일 상태 전이 | 안전 |
| AI 파이프라인 | reuse 조회는 임베딩 1회 추가(히트 시 LLM 절약), 실패 시 완전 폴백; 모더레이션·에스컬레이션·trace 계약 유지 | 안전 |
| 모더레이션(FR-069) | 캐시 답변도 게이트 통과(삽입 위치가 게이트 앞) — 비우회 보장 | 준수 |
| 개인정보 | 재사용 저장분은 PII 스크럽본만, 주문 맥락 답변 제외; DSAR 삭제 시 answer_reuse도 삭제 대상에 포함 필요(**privacy.service 삭제 경로에 추가**) | 주의(구현 포함) |
| 스텁 엔진 테넌트 | reuse 비활성(의사 임베딩) | 명시 처리 |

## 배포 (Migration — 각 PR 본문에 복제)
- PR-A: `sql/260808-tenant-widget-copy.sql` / PR-C1: `sql/260808-answer-reuse.sql` — 모두 **staging 선적용 → 코드 배포**, 추가 전용, 롤백=코드 revert.
- PR-B: 스키마 없음.

## 테스트 계획 (TCR에서 상세화)
- A: 문구 설정→ensure 반영→위젯 표시(언어 3종·폴백·{name}/{shop} 치환), 신규 세션 1회 노출, 콘솔 저장 토스트.
- B: 고객 종료→ENDED/배정 release→"종료" 표시→새 메시지=새 대화; 상담원 종료 시 위젯 표시; open 대화 없음 no-op.
- C: 적재 필터(주문맥락 제외·저신뢰 제외·스텁 제외·중복 병합), 임계값 히트/미스, 폴백(Qdrant 다운), 모더레이션 통과, hit_count·trace, 콘솔 편집 저장·비활성.
- 스테이징 E2E: 실몰에서 동일 질문 2회 → 2회째 reuse trace 확인·응답 시간 단축.

## 산출물/순서
1. **PR-A** 문구 설정화(+SQL) → 2. **PR-B** 상담종료 → 3. **PR-C1** 재사용 백엔드(+SQL) → 4. **PR-C2** 재사용 콘솔 UI
5. TCR/RPT + 메모리 갱신. 각 PR 머지 시 스테이징 배포·검증(마이그레이션 순서 준수).

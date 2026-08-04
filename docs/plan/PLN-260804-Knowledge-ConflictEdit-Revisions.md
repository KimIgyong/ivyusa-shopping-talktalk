# PLN — 충돌 판정 실패 가시화 · 충돌 화면 내 편집 · 수정 히스토리 구현 계획

| | |
|---|---|
| Doc ID | CHATWIDGET-PLN-KBEDIT-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 문서 | `docs/analysis/REQ-260804-Knowledge-ConflictEdit-Revisions.md` (v1.0.1, PR #97) |
| 상태 | 사용자 지시("작업계획서 작성하고 구현 진행")로 **승인 게이트 없이 착수** |
| UI 영향 | **있음** — `/knowledge` 충돌 패널 개편 + 문서 이력 패널 신설 (§3·§4 와이어프레임) |
| 스키마 변경 | **있음** — T1(`kb_conflicts` 확장), T3(`kb_document_revisions` 신설) |

---

## 0. 결정 사항 (REQ §5 권고안 채택)

E1~E10에 대한 별도 회신이 없어 **REQ에 기재한 기본 권고안을 그대로 채택**했습니다.
아래가 이번 구현의 전제이며, 다르게 가야 할 항목이 있으면 해당 단계 착수 전 되돌릴 수 있습니다.

| # | 결정 | 채택안 |
|---|---|---|
| E1 | 수정 히스토리 방식 | **C — 감사 로그 + 스냅샷 이력 병행** |
| E2 | 되돌리기 | **제공** |
| E3 | 이력 기록 범위 | **지식 도메인 전체**(생성·수정·삭제·활성토글·검토완료·충돌해소) |
| E4 | 판정 실패 쌍 | **실패 상태로 저장**, 검토 큐와 분리 표시 |
| E5 | 재시도 정책 | **3회 후 자동 중단 + 수동 재시도** |
| E6 | 충돌 화면 편집 | **카드 내 인라인** |
| E7 | 편집 후 재판정 | **해당 쌍만 재판정** |
| E8 | 발췌 400자 | **전문 표시 + 접기** |
| E9 | 충돌 근거 모더레이션 | **판정은 항상 저장, 근거만 보류 표시** |
| E10 | `warn`→`block` 결함 | **별도 FIX로 분리, 먼저 처리** |

---

## 1. 단계 구성

| 단계 | 범위 | 스키마 | 규모 |
|---|---|---|---|
| **T0** | E10 — `warn` 액션이 차단으로 동작하는 기존 결함 (별도 FIX 문서) | 없음 | 0.5d |
| **T1** | ① 판정 실패 가시화 (E4·E5·E9) | **있음** | 1d |
| **T2** | ② 충돌 화면 내 편집 (E6·E7·E8) | 없음 | 2d |
| **T3** | ③ 수정 히스토리 (E1·E2·E3) | **있음** | 3d |
| | **합계** | | **6.5d** |

T0은 나머지와 **원인·영향 범위가 다르므로** 독립 PR + `FIX-260804-Moderation-Warn-Blocks.md`로
분리합니다. T1은 T0에 의존하지 않지만(E9가 모더레이션 결과와 무관하게 판정을 저장하므로),
T0을 먼저 넣으면 실패 11건 중 상당수가 애초에 발생하지 않습니다.

---

## 2. T0 — `warn` 액션 수정 (0.5d, 스키마 없음)

### 현행
```ts
if (action === MODERATION_ACTION.BLOCK || action === MODERATION_ACTION.WARN) {
  return this.finalize(input, MODERATION_DECISION.BLOCKED, action, '', rule.id);
}
```
운영자가 **경고**로 설정한 규칙이 **차단**으로 동작하며 본문을 비웁니다.

### 변경
- `WARN`은 **전달하되 기록**합니다 — `moderation_logs`에 `action='warn'`, `rule_id`와 함께 남기고
  본문은 그대로 통과시킵니다.
- **경고 후 규칙 순회를 계속합니다.** 현재는 첫 매칭에서 즉시 반환하므로, 뒤에 오는
  `block`/`mask` 규칙이 평가되지 않습니다 — 경고 하나가 실제 차단 규칙을 가리는 상태입니다.
- `MODERATION_DECISION`은 건드리지 않습니다(`DELIVERED`/`EDITED`/`BLOCKED`). 소비자는 전부
  `decision === BLOCKED`만 검사하므로 계약 변경이 없습니다. 경고 사실은 로그로 확인합니다.

### 영향
- **고객 대화**: 답변에 `guarantee`가 포함돼도 더 이상 차단·이관되지 않습니다(현재 실피해 0건이나 잠재).
- **충돌 근거**: 11건 중 `guarantee` 단어 규칙에 걸린 건이 통과합니다.
  단, `context` 규칙(LLM 판정, action=block)에 걸리는 건은 여전히 차단되므로 **T1의 E9가 필요**합니다.

---

## 3. T1 — 판정 실패 가시화 (1d, **스키마 변경**)

### 3-1. 판정 결과 모델 변경

`judge()`가 `null`을 반환하던 4경로를 **판별 가능한 결과**로 바꿉니다.

| 경로 | 기존 | 변경 후 |
|---|---|---|
| 모델 호출 실패 | null (WARN 로그) | `{ok:false, reason:'model_error'}` |
| JSON 파싱 실패 | null (무음) | `{ok:false, reason:'parse_fail'}` + WARN 로그 |
| 허용 밖 verdict | null (무음) | `{ok:false, reason:'bad_verdict'}` + WARN 로그 |
| **모더레이션 차단** | null (무음) | **`{ok:true, verdict, rationale:null, withheld:true}`** ← **실패가 아님(E9)** |

> **E9의 핵심**: 판정값은 `conflict|duplicate|complementary` 3값 열거형이라 모더레이션 위반이
> 불가능합니다. 자유 텍스트는 근거뿐인데, 근거 하나 때문에 **"두 문서가 상충한다"는 정보 전체를
> 버리고 있었습니다.** 근거가 막히면 근거만 비우고 판정은 저장합니다 — 관리자는 좌우 문서를
> 직접 비교할 수 있습니다(T2에서 전문이 보이므로 더욱).

### 3-2. 스키마 — `kb_conflicts` 확장

```sql
ALTER TABLE kb_conflicts
  ADD COLUMN failure_reason      VARCHAR(24) NULL,   -- model_error|parse_fail|bad_verdict
  ADD COLUMN attempts            INT NOT NULL DEFAULT 1,
  ADD COLUMN rationale_withheld  TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN last_attempt_at     DATETIME NULL;
```
`status`에 `failed` 값이 추가됩니다(`pending|resolved|dismissed|failed`).

### 3-3. 스캔 동작

- 실패 쌍은 `status='failed'` + `failure_reason` + `attempts`로 **저장**됩니다 → `knownPairs()`에
  걸려 다음 스캔에서 재판정되지 않습니다(현재 스캔당 11회 낭비 제거).
- 단 **`attempts < 3`인 실패 쌍은 재시도 대상**에 포함합니다. 3회 도달 시 자동 재시도 중단(E5).
- 수동 재시도(`POST /knowledge/conflicts/:id/retry`)는 `attempts`를 무시하고 1회 재판정합니다.
- `ScanResult`에 `failed`, `withheld` 카운트를 추가해 스캔 결과 토스트에서 바로 보입니다.

### 3-4. 화면 — 충돌 패널 상단 (신설 영역)

```
┌─ 지식 충돌 검토 (110) ─────────────── [미검토 ▼] [충돌 재탐지 ⟳] ─┐
│                                                                    │
│ ⚠ 판정 실패 3건 — 검토 큐에 넣지 못했습니다        [모두 재시도 ⟳] │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ 2.1.3 배송비  ↔  FAQ 무료배송   유사도 0.91                    │ │
│ │ 사유: 응답 파싱 실패 · 시도 3/3 · 마지막 08-04 07:12   [재시도] │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                    [펼치기 ▾ 2건]  │
├────────────────────────────────────────────────────────────────────┤
│ ● 상충  유사도 0.87                              검출 08-04       │
│ …(기존 카드)                                                       │
```

근거가 보류된 카드는 근거 자리에 다음이 표시됩니다.

```
│ 판정 근거: ⚠ 모더레이션 규칙에 걸려 표시하지 않습니다(규칙 #1).     │
│            아래 두 문서를 직접 비교해 주세요.                       │
```

---

## 4. T2 — 충돌 화면 내 편집 (2d, 스키마 없음)

### 4-1. 카드 구조 변경

- `summarize()`가 **전문**을 반환합니다(현재 400자 절단). 평균 242자·최대 914자라 부담 없음(E8).
  6줄을 넘으면 `[더보기]`로 접습니다.
- 각 면(A/B)에 **[편집]** 버튼 → **카드 안에서** 제목·카테고리·본문이 입력 필드로 바뀝니다.
  **반대편은 그대로 보입니다** — 이것이 이 요구의 핵심입니다.
- 저장은 기존 `PATCH /knowledge/documents/:id`를 그대로 사용합니다(본문 변경 시 자동 재임베딩).
- 양쪽을 동시에 편집할 수 있고, 각각 독립 저장합니다.

### 4-2. 편집 후 재판정 (E7)

`POST /knowledge/conflicts/:id/rejudge` — 현재 문서 내용으로 해당 쌍만 다시 판정하고
`verdict`/`rationale`/`similarity`를 갱신합니다. 전체 스캔(229문서 임베딩)이 불필요해집니다.

### 4-3. 와이어프레임 — 편집 모드

```
┌─ 지식 충돌 검토 ───────────────────────────────────────────────────────────┐
│ ● 상충   유사도 0.865                                     검출 2026-08-04  │
│ ┌──────────────────────────────────┬──────────────────────────────────┐   │
│ │ A  Shipping & Delivery    [편집] │ B  2.1.2 Estimated…   [저장][취소]│   │
│ │ 지식저장소 · 기준일 2026-03-01   │ 제목 [2.1.2 Estimated Delivery ] │   │
│ │ 최종수정 2026-07-30              │ 분류 [policy_shipping ▼]         │   │
│ │                                  │ 내용 ┌──────────────────────────┐│   │
│ │ Standard delivery is 3-5         │      │Transit after shipment is ││   │
│ │ business days after the order    │      │5-7 business days. Order  ││   │
│ │ is placed. Free shipping over    │      │processing takes 1-3 days ││   │
│ │ $29.99…                          │      │and is counted separately.││   │
│ │                        [더보기 ▾]│      └──────────────────────────┘│   │
│ └──────────────────────────────────┴──────────────────────────────────┘   │
│ 판정 근거: A는 주문일 기준 3~5영업일, B는 발송 후 5~7영업일로 기준이 다름 │
│                                                                            │
│ [ A를 채택 · B 숨김 ] [ B를 채택 · A 숨김 ] [ 둘 다 유지 ] [ 보류 ]        │
│ [ 이 쌍 재판정 ⟳ ]                            ⓘ 저장 시 재색인됩니다      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. T3 — 수정 히스토리 (3d, **스키마 변경**)

### 5-1. 기록 방식 (E1 = C, 병행)

| 층 | 저장소 | 답하는 질문 |
|---|---|---|
| **감사 로그** | `audit_logs` (`knowledge.*`) | 언제·누가·무엇을 했는가 — `/work-log`에서 상담원 작업과 함께 조회 |
| **스냅샷 이력** | `kb_document_revisions` (신규) | 그때 내용이 무엇이었는가 · 되돌리기 |

### 5-2. 스키마 — `kb_document_revisions`

```sql
CREATE TABLE IF NOT EXISTS kb_document_revisions (
  id              BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id       BIGINT NOT NULL,
  document_id     BIGINT NOT NULL,
  revision_no     INT    NOT NULL,          -- 문서별 1부터
  title           VARCHAR(255) NOT NULL,
  category        VARCHAR(64)  NULL,
  content         LONGTEXT     NULL,
  source_url      VARCHAR(512) NULL,
  effective_from  DATE         NULL,
  review_interval_days INT     NULL,
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  changed_fields  JSON         NULL,        -- ['title','content']
  change_kind     VARCHAR(16)  NOT NULL,    -- baseline|update|restore|delete
  actor_user_id   BIGINT       NULL,        -- baseline은 NULL(구현 이전 상태)
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kbrev (tenant_id, document_id, revision_no),
  KEY idx_kbrev_doc (tenant_id, document_id, revision_no DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**베이스라인 처리** — 이번 구현 이전의 이력은 소급할 수 없습니다. 이력이 없는 문서를 처음
수정할 때 **두 행을 씁니다**: `revision_no=1` = 수정 **직전** 상태(`change_kind='baseline'`,
actor NULL), `revision_no=2` = 수정 후 상태. 이렇게 해야 첫 수정도 되돌릴 수 있습니다.

### 5-3. 기록 지점 (E3 = 전체)

| 동작 | 감사 action | 스냅샷 |
|---|---|---|
| 문서 생성 | `knowledge.document_created` | rev 1 (`create`) |
| 문서 수정 | `knowledge.document_updated` | 베이스라인(필요 시) + 신규 rev |
| 문서 삭제 | `knowledge.document_deleted` | 마지막 상태 보존 후 문서 삭제 |
| 활성 토글 | `knowledge.document_activated/deactivated` | rev(활성 변경만) |
| 검토 완료 | `knowledge.document_reviewed` | 스냅샷 없음(본문 무변경) |
| 충돌 채택/보류 | `knowledge.conflict_resolved/dismissed` | 숨겨진 문서 쪽에 rev |
| 되돌리기 | `knowledge.document_restored` | 신규 rev (`restore`, from=N 기록) |

> 문서 삭제는 하드 삭제이므로(§13 편차), 이력은 **문서보다 오래 남습니다.**
> `document_id`에 FK를 걸지 않는 이유입니다.

### 5-4. API

```
GET  /knowledge/documents/:id/revisions           목록(번호·시각·작성자·변경필드)
GET  /knowledge/documents/:id/revisions/:revId    본문 포함 1건
POST /knowledge/documents/:id/revisions/:revId/restore   되돌리기(E2)
```
권한은 편집과 동일한 `KNOWLEDGE_SOURCE_MANAGE`.

### 5-5. 와이어프레임 — 문서 상세 모달의 이력 탭

```
┌─ 문서 상세 · 2.1.3 배송비 ──────────────────────────────── [닫기 ✕] ─┐
│ [ 내용 ]  [ 수정 이력 (4) ]                        ← 탭                │
├───────────────────────────────────────────────────────────────────────┤
│ rev 4  2026-08-04 07:12  이상담   본문·기준일        [보기] [되돌리기] │
│ rev 3  2026-08-03 21:40  김운영   분류              [보기] [되돌리기] │
│ rev 2  2026-07-31 10:05  이상담   제목·본문         [보기] [되돌리기] │
│ rev 1  2026-07-30 18:39  —        (구현 이전 상태)  [보기]            │
├───────────────────────────────────────────────────────────────────────┤
│ ▼ rev 3 보기 — 현재와 비교                                            │
│ ┌─────────────────────────────┬─────────────────────────────────────┐ │
│ │ rev 3 (2026-08-03)          │ 현재 (rev 4)                        │ │
│ │ - 무료배송 $19.99 이상      │ + 무료배송 $29.99 이상              │ │
│ │   반품 배송비 $6.95         │   반품 배송비 $6.95                 │ │
│ └─────────────────────────────┴─────────────────────────────────────┘ │
│ ⓘ 되돌리면 새 이력(rev 5)으로 기록되며 기존 이력은 지워지지 않습니다. │
└───────────────────────────────────────────────────────────────────────┘
```

차이 표시는 **줄 단위**로 충분합니다(본문 평균 242자). 외부 diff 라이브러리를 들이지 않고
공용 LCS 유틸을 직접 둡니다 — 번들 크기와 CSP 제약 모두에 유리합니다.

---

## 6. 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| **모더레이션 계약** | T0이 `warn` 동작을 바꿈 | `decision` 열거형·API 응답 불변. 소비자는 `BLOCKED`만 검사 |
| **고객 대화** | T0으로 `guarantee` 포함 답변이 더 이상 차단되지 않음 | **의도된 변경**(운영자가 경고로 설정). 회귀 테스트로 고정 |
| **재색인 부하** | T2 인라인 편집이 저장마다 재임베딩 유발 | Tier 1(2,000 RPM) 확보로 여유. 배치 아님(단건 저장) |
| **retention 퍼지** | 이력은 대화 로그와 수명이 다름 | `kb_document_revisions`를 퍼지 대상에 **넣지 않음** + 테스트로 고정 |
| **저장량** | 편집마다 전문 스냅샷 | 230건 평균 242자(전체 54KB) — 무시 가능 |
| **PII** | 이력에 고객 정보 유입 가능성 | 정책 문서라 낮음. 열람 권한을 편집 권한과 동일하게 유지 |
| **하드 삭제** | 문서 삭제 후에도 이력 잔존 | `document_id` FK 미설정. DSAR 대상 아님(고객 데이터 아님) |
| **i18n** | 신규 문자열 다수 | `knowledge` 네임스페이스에 en/es/ko 동시 추가 |
| **UX 피드백** | 편집·되돌리기·재시도·재판정 등 신규 쓰기 액션 | 전부 toast 성공/실패 (dev-kit §4.3) |

---

## 7. 테스트 계획 (상세는 TCR)

- **T0**: warn이 전달됨 · warn 후에도 뒤 규칙이 평가됨 · block은 그대로 차단 · 로그에 rule_id 기록
- **T1**: 실패 사유 4종 분류 · 실패 쌍이 재스캔에서 제외됨 · attempts 3회 후 자동 중단 ·
  수동 재시도가 attempts를 무시 · **모더레이션 차단 시 판정은 저장되고 근거만 비워짐**
- **T2**: 전문 반환 · 편집 저장이 재임베딩 유발 · 쌍 재판정이 verdict 갱신 · 반대편 미영향
- **T3**: 베이스라인 2행 생성 · 되돌리기가 새 rev를 만들고 기존 이력 보존 · 삭제 후 이력 잔존 ·
  퍼지 비대상 · 감사 action 기록 · 줄 단위 diff 경계(빈 본문·동일 본문)

---

## 8. 마이그레이션

| 단계 | 파일 | 내용 |
|---|---|---|
| T1 | `sql/migration_kb_conflict_failures.sql` | `kb_conflicts` +4컬럼 |
| T3 | `sql/migration_kb_document_revisions.sql` | `kb_document_revisions` 신규 |

전부 추가 전용. 스테이징 `DB_SYNCHRONIZE=false` → **SQL 선적용 후 코드 배포**.
⚠️ **`ON UPDATE CURRENT_TIMESTAMP` 주의** — 백필성 UPDATE를 쓸 경우 해당 컬럼을 명시 대입해야
합니다(2026-08-04 실사고, `FIX`/PR #93). 이번 두 마이그레이션에는 백필 UPDATE가 없습니다.

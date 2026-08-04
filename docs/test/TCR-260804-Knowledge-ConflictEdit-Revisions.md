# TCR — 판정 실패 가시화 · 충돌 화면 내 편집 · 수정 히스토리 테스트 결과서

| | |
|---|---|
| Doc ID | CHATWIDGET-TCR-KBEDIT-1.0.0 |
| 작성일 | 2026-08-04 |
| 대상 | `PLN-260804-Knowledge-ConflictEdit-Revisions` (T0~T3) |
| 결과 | **전체 통과** — api 439 / common 13 / types 10, 모노레포 typecheck·build 통과 |

---

## 0. 요약

| 구분 | 시작 | 종료 | 증가 |
|---|---|---|---|
| API 테스트 | 427 | **439** | **+12** |
| 테스트 스위트 | 41 | **42** | +1 |

**테스트가 실제 결함 2건을 잡았습니다**(§4). 둘 다 구현 중 발견해 수정했습니다.

---

## 1. T0 — `warn` 액션 (4건)

| 케이스 | 검증 | 결과 |
|---|---|---|
| warn 규칙 → `DELIVERED` + 본문 보존 | 핵심 증상. 기존에는 `BLOCKED` + 본문 삭제 | PASS |
| warn 로그에 `action='warn'` + `ruleId` | 경고가 조용히 사라지지 않음 | PASS |
| **warn 뒤의 block 규칙이 여전히 평가됨** | 첫 매칭 즉시 반환이 뒤 규칙을 가리던 두 번째 문제 | PASS |
| warn + mask → `EDITED` + 마스킹 | 순회 계속이 mask를 깨지 않음 | PASS |
| block 규칙은 그대로 차단 | 수정이 차단을 약화시키지 않음 | PASS |

---

## 2. T1 — 판정 실패 가시화 (6건)

| 케이스 | 검증 | 결과 |
|---|---|---|
| 파싱 실패 → `failed` + `parse_fail` 저장 | 조용한 폐기 대신 기록. `attempts=1` | PASS |
| 허용 밖 verdict → `failed` + `bad_verdict` | | PASS |
| 모델 호출 실패 → `failed` + `model_error` | | PASS |
| **모더레이션 차단 → 판정 저장, 근거만 보류** | `judged=1`, `withheld=1`, `failed=0`, `rationale=null`, `rationaleWithheld=1` | PASS |
| 재시도 예산 내 실패 쌍은 **기존 행을 갱신**하며 재판정, 3회 도달 시 후보에서 제외 | 중복 행 생성 없음(`id` 유지), `attempts` 증가 | PASS |
| 보류(dismissed) 쌍은 어떤 경우에도 재판정 안 함 | 검토자 결정 유지, 모델 호출 0 | PASS |

> 4번째 케이스가 이번 변경의 핵심입니다 — 근거 한 문장 때문에 "두 문서가 상충한다"는 판정
> 전체를 버리던 동작을 고정합니다.

---

## 3. T3 — 수정 히스토리 (11건)

| 케이스 | 검증 | 결과 |
|---|---|---|
| **첫 수정 시 베이스라인 + 변경 2행** | rev1 `baseline`/actor null/이전 내용, rev2 `update`/actor/새 내용 | PASS |
| 이력 존재 시 변경 1행만 | | PASS |
| **`MAX+1` 번호 채번** | `COUNT+1` 금지(저장소 규약). max 9 → 10 | PASS |
| 변경 없는 저장은 기록 안 함 | 편집기 열고 저장만 눌러도 이력이 쌓이지 않음 | PASS |
| 변경 필드 전부 나열 | title·content·active 동시 변경 | PASS |
| **Date/문자열 혼재 시 미변경 판정** | DATE 컬럼이 드라이버 경로에 따라 두 형태로 옴 | PASS *(초기 실패 → §4-1)* |
| 감사 메타에 필드명만, 본문 없음 | 본문은 수명이 다른 이력 행에 저장 | PASS *(초기 실패 → §4-2)* |
| 생성 → `create` + 전체 필드 + 감사 | | PASS |
| **되돌리기는 새 이력으로 전진** | rev4 `restore`, `restoredFrom=2`, 기존 이력 불변 | PASS |
| 메타만 다르면 `contentChanged=false` | 불필요한 재임베딩 회피 | PASS |
| **이력 실패가 편집을 막지 않음** | 저장 이후 단계이므로 예외를 삼키고 null 반환 | PASS |
| 충돌 채택 시 감사 기록(`knowledge.conflict_resolved` + resolution) | | PASS |

---

## 4. 테스트가 잡아낸 결함 2건

### 4-1. `changedFields`의 Date 정규화가 실제로는 동작하지 않음
`String(v)`로 비교했는데 `String(new Date('2026-03-01'))`은 `"Fri Feb 28 2026 …"`(로케일 의존)라
문자열 `"2026-03-01"`과 **절대 같아지지 않습니다.** 주석에는 "처리한다"고 써 있었지만 실제로는
`effectiveFrom`이 매 저장마다 변경으로 잡혀 **불필요한 이력 행이 계속 쌓일** 상태였습니다.
→ `Date`는 `toISOString().slice(0,10)`으로 정규화.

### 4-2. spec 생성자 인자 불일치가 조용히 통과
`apps/api/tsconfig.json`이 `src/**/*.spec.ts`를 **typecheck에서 제외**합니다. `KbConflictService`에
`AuditService`를 추가했는데 spec은 5개 인자만 넘겼고, `auditConflict`가 예외를 삼키는 구조라
**테스트가 그대로 통과**했습니다 — 감사 경로가 검증되지 않은 채로.
→ spec에 audit 목을 주입하고 **감사 기록 자체를 단언**하도록 수정.

> 예방 관점: spec이 typecheck 밖이므로 **생성자에 의존성을 추가할 때는 해당 spec을 반드시
> 함께 확인**해야 합니다. 이 저장소에서 같은 유형이 이번을 포함해 3회 발생했습니다.

---

## 5. 마이그레이션 검증

| 검증 | 방법 | 결과 |
|---|---|---|
| **생성 경로** | scratch DB에 신규 컬럼 없는 `kb_conflicts` + 기존 행 1건 생성 후 적용 | 4컬럼 생성, `kb_document_revisions` 생성 |
| 기존 행 기본값 | 적용 후 기존 행 조회 | `attempts=1`, `rationale_withheld=0`, `failure_reason=NULL` |
| **멱등성** | 동일 SQL 재적용 | `already present` 안내만, 무오류 |

⚠️ 두 마이그레이션 모두 **백필 UPDATE가 없습니다** — `ON UPDATE CURRENT_TIMESTAMP` 컬럼을
건드려 `updated_at`을 덮어쓴 2026-08-04 사고(PR #93)의 재발 여지가 없습니다.

## 6. 부팅

엔티티 2종 추가(`KbDocumentRevision`, `kb_conflicts` 확장)이므로 강제 재빌드 후 실부팅 확인:
`Nest application successfully started`, ERROR 0건.

> TypeORM DataSource 초기화 실패는 `tsc`가 잡지 못하는 부팅 크래시입니다(dev-kit lesson A-1).

---

## 7. 미검증 항목

| 항목 | 사유 |
|---|---|
| 스테이징 배포 후 화면 클릭 | 콘솔 비밀번호 운영자 보유 |
| 실제 실패 11쌍의 T0 이후 통과 여부 | 배포 후 스캔 재실행으로 확인 필요 — `guarantee` 단어 규칙(warn)에 걸린 건은 통과하나 `context` 규칙(block)에 걸리는 건은 여전히 근거 보류 |
| 되돌리기 후 RAG 답변 변화 | 재임베딩은 코드로 검증했으나 실제 검색 결과 변화는 스테이징 확인 필요 |

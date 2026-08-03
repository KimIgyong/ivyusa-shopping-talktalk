# TCR — 운영 로그·통계·지식 충돌 관리 테스트 결과서

| | |
|---|---|
| Doc ID | CHATWIDGET-TCR-OPSLOG-1.0.0 |
| 작성일 | 2026-08-04 |
| 대상 | PLN-Ops-Logs-Stats-KnowledgeConflict-20260804 (S0~S4) |
| PR | #87 (S0) · #88 (S1) · #89 (S2) · #90 (S3) · #91 (S4) |
| 결과 | **전체 통과** — api 416 / common 13 / types 10, 모노레포 typecheck·build 통과 |

---

## 0. 요약

| 구분 | 시작 | 종료 | 증가 |
|---|---|---|---|
| API 단위·통합 테스트 | 354 | **416** | **+62** |
| common (권한 매트릭스) | 12 | **13** | +1 |
| 테스트 스위트 | 36 | **41** | +5 |

CI 게이트(`typecheck · test · build`)는 5개 PR 전부에서 통과했고, 각 단계마다 **컴파일된 산출물로 실제 부팅**을 확인했습니다(`Nest application successfully started`). 엔티티 변경이 있는 단계에서는 강제 재빌드 후 다시 확인했습니다 — 캐시된 `dist`로 부팅하면 검증이 무의미하기 때문입니다.

---

## 1. 단위 테스트

### 1-1. 권한 매트릭스 (`permission-matrix.spec.ts`)

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| 두 관리자 레벨의 감사 권한 | super_admin·admin이 `PLATFORM_AUDIT_READ`와 `TENANT_AUDIT_READ`를 모두 보유 | PASS |
| 테넌트 측 불변 | master·director는 보유, manager는 미보유 | PASS |

> 회귀 방지 대상: 이 불일치 때문에 **감사 로그를 볼 수 있는 사용자가 한 명도 없었습니다.**

### 1-2. 기간 파싱 (`date-range.util.spec.ts`, 8건)

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| 부재·비정상 입력 | `undefined`/`''`/`yesterday`/`2026-13-45x` → `undefined` | PASS |
| **UTC 앵커링** | bare date가 호스트 타임존이 아니라 **UTC 자정**에 고정 | PASS |
| 상한 확장 | `to=2026-08-04` → `2026-08-05T00:00Z` (배타적) | PASS |
| ISO 통과 | 완전한 ISO 인스턴트는 변형 없이 통과 | PASS |
| 월말 경계 | `2026-01-31` 확장 시 `2026-02-01` | PASS |
| `utcDayBounds` | 정확히 86,400,000ms 구간, 키 왕복 무손실 | PASS |

### 1-3. 키워드 추출 (`keyword.util.spec.ts`, 9건)

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| 정규화 | 구두점 제거·공백 축약·소문자화 | PASS |
| en 불용어 | `return`/`damaged`/`item` 유지, `how`/`the` 제거 | PASS |
| es 불용어 | `llega`/`pedido` 유지, `el`/`de` 제거 | PASS |
| **ko 2-gram** | `반품`·`배송`·`송비` 추출(Hangul run 내 슬라이딩) | PASS |
| ko 내 라틴 토큰 | `주문번호 AB1234` → `ab1234` 유지 | PASS |
| 질문당 중복 제거 | `refund refund refund` → 1회 | PASS |
| 언어 미상 폴백 | `null`/`de` → 영어 토크나이징 | PASS |
| 빈/기호 전용 입력 | `[]` 반환 | PASS |
| 상한 | limit 초과 시 절단 | PASS |

### 1-4. 클러스터 수학 (`question-stats.service.spec.ts`)

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| 코사인 정상값 | 동일 벡터 1, 직교 0 | PASS |
| **0벡터·길이 불일치** | `NaN`이 아니라 0 반환 | PASS |
| 센트로이드 병합 | size 1 → 두 벡터의 평균; size 99 → 거의 이동 없음 | PASS |

### 1-5. 노후 판정 (`kb-conflict.service.spec.ts`)

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| 주기 미설정 | 항상 false | PASS |
| 주기 경과 | 최종검토 + 주기 < 오늘 → true | PASS |
| 주기 내 | false | PASS |
| **검토 이력 없음** | `updated_at`으로 폴백 → true (쓴 뒤 아무도 안 본 문서) | PASS |
| 주기 0/음수 | "항상 노후"가 아니라 "주기 없음"으로 처리 | PASS |

---

## 2. 통합 시나리오

### 2-1. 대화 이력 · 가시성 (`analytics.service.spec.ts`, 9건)

| 시나리오 | 기대 | 결과 |
|---|---|---|
| 미리보기 기본 제외 | `sessions` 대상 EXISTS 절이 걸림 (conversation.channel이 아님) | PASS |
| 명시 포함 | `include_preview=true`면 해당 절 없음 | PASS |
| 계급 제한 (D1) | `restrictToAgentId` 지정 시 `c.agent_id = :scopeAgent` | PASS |
| 기간·본문 검색 | `created_at >=/<` + `messages qm` EXISTS | PASS |
| 이름 해석 | 담당자 실명 해석, 고객명은 **마스킹**(원문 불일치) | PASS |
| 원문 + 근거 | AI 턴에 `{citations, confidence}` 부착, 사용자 턴은 `null` | PASS |
| 상담원 턴 귀속 | `senderName` 실명 해석 | PASS |
| 스코프 위반 | 타 상담원 대화는 **null → 404** (403 아님) | PASS |
| 비정형 trace | 문자열 등 오염 데이터는 `null` 처리, 원본 노출 없음 | PASS |

### 2-2. 감사 · 작업로그 (`audit.service.spec.ts`, 6건)

| 시나리오 | 기대 | 결과 |
|---|---|---|
| actor 이름 해석 | 사용자 실명 / 관리자 이메일 / 기계는 `system` | PASS |
| 필터 조합 | `actor_id` · `action LIKE 'agent.%'` · 기간 양단 | PASS |
| 삭제된 actor | 이름 없이 `null` 폴백(에러 아님) | PASS |
| 작업로그 렌즈 | prefix 필터가 **테넌트 스코프를 유지** | PASS |
| 기존 write 동작 | 요청 컨텍스트 자동 채움·명시값 우선·system actor | PASS (회귀 없음) |

### 2-3. 메시지 적재 (`chat.service.spec.ts`, 신규 2건)

| 시나리오 | 기대 | 결과 |
|---|---|---|
| **tenant_id 명시 스탬프** | 사용자·AI 턴 모두 `tenantId=1` | PASS |
| **의도 라벨 적재** | `classifyIntent` **1회만 호출**, 결과가 사용자 턴에 UPDATE | PASS |

> 두 번째 케이스는 "통계용 의도 축이 추가 모델 호출 없이 성립한다"는 설계 전제를 고정합니다.

### 2-4. 질문 통계 집계 (`question-stats.service.spec.ts`, 11건)

| 시나리오 | 기대 | 결과 |
|---|---|---|
| 의도 축 | 저장된 라벨로 집계 | PASS |
| 문서·카테고리 축 | `retrieval_trace` citations → 문서 제목·카테고리 | PASS |
| 키워드 축 | `return`/`shipping` 등 추출 | PASS |
| 이관·근거없음 | 이관 대화 1건 / 인용 0건 대화 1건이 정확히 반영 | PASS |
| **tenant 없는 질문** | 타 테넌트로 귀속하지 않고 **건너뜀** | PASS |
| 신규 클러스터 | 매칭 없으면 생성 | PASS |
| 기존 클러스터 편입 | 임계값 이상이면 기존 id에 합류 | PASS |
| **임베딩 실패 내성** | 클러스터 축만 비고 **나머지 3축은 정상 산출** | PASS |
| upsert 키 | `(tenant, date, dimension, key)` 충돌 경로 확인 | PASS |
| **라벨 PII 스크럽** | 이메일이 클러스터 라벨·**임베딩 입력** 어디에도 남지 않음 | PASS |
| 데이터 없는 날 | 0건 결과 정상 반환 | PASS |

### 2-5. 지식 충돌 (`kb-conflict.service.spec.ts`, 11건)

| 시나리오 | 기대 | 결과 |
|---|---|---|
| 상충 쌍 큐잉 | verdict·rationale 저장, 금액 차이 근거 포함 | PASS |
| **쌍 정규화** | 항상 작은 id 우선 → 좌우 뒤집힘 중복 없음 | PASS |
| 임계값 미만 | 후보 제외 | PASS |
| **이미 본 쌍(보류 포함)** | 재판정 안 함 → 검토자 결정 유지, 모델 호출 0 | PASS |
| 파싱 불가 판정 | 아무것도 저장 안 함 | PASS |
| 허용 외 verdict | 저장 안 함 | PASS |
| **모더레이션 차단** | 근거가 차단되면 저장 안 함 (POL-020) | PASS |
| 벡터 검색 불가 | 무동작 반환 | PASS |
| 채택 처리 | 반대편 `active=0` + `superseded_by` 기록 | PASS |
| 둘 다 유지 | 가시성 변경 없음 | PASS |
| 잘못된 resolution | 예외 | PASS |

---

## 3. 실데이터 검증 (로컬 DB)

단위 테스트가 목(mock) 기반이므로, **실제 MySQL·실제 대화 데이터**로 파이프라인을 확인했습니다.

### 3-1. 집계 end-to-end

```
run1: {"statDate":"2026-08-03","questions":11,"rows":47,"clustersCreated":6}
run2: {"statDate":"2026-08-03","questions":11,"rows":47,"clustersCreated":0}
```

| 확인 | 결과 |
|---|---|
| 4축 산출 | document 12키/24건 · category 5키/24건 · keyword 24키/49건 · cluster 6키/11건 |
| **재실행 안전성** | 2회차 행 수 동일, 신규 클러스터 0 → **중복 집계 없음** |
| 한국어 라벨 | `배송비 얼마인가요?` 등 정상 저장(utf8mb4 확인) |
| 이관·신뢰도 | escalated·avg_confidence 값 정상 기록 |

> `intent` 축은 0건입니다. 정상이며, 해당 컬럼이 이번에 추가되어 **기존 메시지에는 라벨이 없기** 때문입니다. 신규 대화부터 채워집니다. 이 때문에 대시보드 "인기 질문"은 과거 데이터에서도 즉시 의미를 갖는 **클러스터 축**을 사용하도록 했습니다.

### 3-2. 마이그레이션 (양방향)

| 검증 | 방법 | 결과 |
|---|---|---|
| 재적용 안전성 | 이미 적용된 스키마에 2회 실행 | `already present` 안내만, 무오류 |
| **생성 경로** | 별도 scratch DB에 신규 컬럼을 제거한 테이블을 만들고 적용 | 8개 컬럼 생성, `kb_conflicts`·`question_stats_daily`·`question_clusters` 생성 |
| 인덱스 | `idx_msg_intent(tenant_id, intent)` · `uk_qstat(tenant, date, dimension, key)` | 생성 확인 |
| **기존 행 백필** | 기존 문서의 `created_at` | 마이그레이션 시각이 아니라 `updated_at`(2026-01-15)에서 시드됨 |

> 스테이징은 `DB_SYNCHRONIZE=false`라 **생성 경로가 실제로 실행됩니다.** 로컬은 synchronize로 이미 컬럼이 있어 이 경로가 검증되지 않으므로 scratch DB로 따로 확인했습니다.

### 3-3. 부팅

| 단계 | 확인 |
|---|---|
| S0 | `Nest application successfully started` |
| S3 | 강제 재빌드 후 재확인(엔티티 2개 추가) |
| S4 | 강제 재빌드 후 재확인(엔티티 1개 추가, 컬럼 8개) |
| 최종 (main) | 부팅 + `Question stats scheduled every 24h (first run in 10 min)` |

> TypeORM DataSource 초기화 실패는 `tsc`가 잡지 못하는 부팅 크래시라(dev-kit lesson A-1) 엔티티 변경마다 실부팅을 확인했습니다.

---

## 4. 발견·수정한 결함

### 4-1. 타임존 (구현 중 실데이터에서 발견)

| 항목 | 내용 |
|---|---|
| 증상 | 집계가 11건 중 **0건** 반환 |
| 원인 | MySQL 컨테이너 UTC + 커넥션 `timezone: 'Z'` 인데 bare date를 **서버 로컬(KST)** 로 파싱 → 창이 9시간 이동 |
| 조치 | 날짜 전용 입력을 **UTC 기준**으로 통일(`parseFrom`/`parseTo`/`toDateKey`/`utcDayBounds`), 스펙도 UTC로 재작성 |
| 재발 방지 | `date-range.util.spec.ts`가 UTC 앵커링을 명시적으로 고정 |

### 4-2. REQ 초판 오류 정정

| 항목 | 내용 |
|---|---|
| 오류 | "`messages.tenant_id`가 기록되지 않아 통계가 항상 빈 결과" |
| 실제 | `TenantSubscriber.beforeInsert`가 요청 컨텍스트에서 **자동 스탬프** — 실측 40건 전부 보유 |
| 조치 | REQ v1.0.1 정정, ④의 선행조건에서 제외. 잔존 위험(요청 밖 쓰기·다중 테넌트 토큰 미해석)만 명시 스탬프로 차단 |

---

## 5. 미검증 항목 (남은 작업)

| 항목 | 사유 |
|---|---|
| 스테이징 배포 후 화면 클릭 검증 | 콘솔 비밀번호는 운영자 보유 — 사람 확인 필요 |
| LLM 충돌 판정 실품질 | 로컬은 stub 어댑터. 스테이징 실 Anthropic 키로 실제 상충 판정 정확도 확인 필요 |
| A3 한국어 키워드 실품질 | 2-gram 기준. 실 트래픽 축적 후 형태소 분석기 도입 여부 판단 |
| e2e HTTP 테스트(supertest) | 기존 미결 항목, 이번 범위 밖 |

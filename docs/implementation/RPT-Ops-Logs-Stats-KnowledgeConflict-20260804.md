# RPT — 운영 로그·통계·지식 충돌 관리 구현 보고서

| | |
|---|---|
| Doc ID | CHATWIDGET-RPT-OPSLOG-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 문서 | REQ (PR #85, v1.0.1) → PLN (PR #86) → 구현 (#87~#91) → TCR |
| 상태 | **구현·테스트·스테이징 배포 완료** (2026-08-04) / 프로덕션 미적용 |
| 규모 | 79 파일, +4,218 / −135 |

---

## 1. 무엇을 만들었나

사용자 요구 5건을 5단계로 나눠 순차 구현했습니다.

| 단계 | 범위 | PR | 커밋 | 스키마 |
|---|---|---|---|---|
| S0 | 선행 결함 B1~B6 | **#87** | `ae57b55` | 없음 |
| S1 | ① 대화 원문 열람 · ② 상담원별 보기 | **#88** | `692cefa` | 없음 |
| S2 | ③ 상담원 작업로그 | **#89** | `da12aa1` | 없음 |
| S3 | ④ 고객질문 통계 4축 | **#90** | `0298ad8` | **있음** |
| S4 | ⑤ 지식 충돌·출처·노후 | **#91** | `1e07307` | **있음** |
| — | TCR + RPT | #92 | `c9d1eef` | 없음 |
| **배포 중 수정** | 백필이 `updated_at` 덮어씀 | **#93** | `50a7fb9` | SQL 수정 |
| **배포 중 수정** | 클러스터링이 stub 벡터 수용 | **#94** | `71f4966` | 없음 |
| **배포 중 수정** | 충돌 스캔 문서당 1요청 | **#95** | `ec3fcf9` | 없음 |

5개 PR 모두 CI 게이트(`typecheck · test · build`) 통과 후 squash 머지했습니다.

---

## 2. 요구별 결과

### ① 고객 대화 로그 보기
이력 화면은 대화를 **목록에 띄우기만 하고 열어볼 수 없었습니다.** 원문을 읽는 유일한 경로가 상담원 콘솔인데 콘솔은 진행 중 대화만 나열하므로, **종료된 대화는 제품 어디에서도 도달 불가**였습니다. 상세 모달이 호출하던 라우트는 애초에 존재하지 않았습니다.

- `GET /analytics/conversations/:id` 신설 — 메시지 스레드 + 각 AI 턴의 **근거 문서·신뢰도**
- 필터: 기간 · 담당 상담원 · 메시지 본문 검색 · 채널 (기존 상태/이관 유지)
- 근거 배지 → `/knowledge?doc=<id>` 딥링크로 해당 문서 즉시 열람
- 열람 시 감사 기록 (`agent.transcript_viewed`)

### ② 상담원별 대화 보기
**별도 화면을 만들지 않고 `/history`의 담당자 필터**로 제공합니다. 목록·상세·권한·감사 로직을 그대로 재사용하므로 가시성 규칙이 한 곳에만 존재합니다. 상담원 선택 시 상단 요약 배지(담당 건수)가 붙습니다.

### ③ 상담원 작업로그
콘솔 5개 행위(수락·답변·고객연결·고객생성·종료)에 감사 기록을 추가하고, 신규 `/work-log` 화면에서 상담원·행위·기간으로 조회합니다. **감사 추적을 `agent.*`로 필터링한 뷰**라 서버에 행위를 추가하면 별도 배선 없이 나타납니다.

### ④ 고객질문 통계 — 4축 전부 (D2)
| 축 | 소스 | 비용 |
|---|---|---|
| 의도 | `classifyIntent` 결과 적재 | **추가 모델 호출 0** (이미 매 턴 호출하고 버리던 값) |
| 지식(문서·카테고리) | `retrieval_trace` citations | **신규 수집 0** (RAG 작업 때부터 저장 중) |
| 키워드 | 언어별 정규화 | en/es 유니그램, ko 2-gram |
| 유사질문 클러스터 | 질문 임베딩 | 증분 할당(전체 재군집 아님) |

각 버킷에 **이관율·근거없음·볼륨 가중 평균 신뢰도**를 함께 담아, "자주 묻고 자주 이관되고 신뢰도 낮은 주제 = 지식 보강 1순위"가 화면에서 바로 드러납니다.

### ⑤ 지식 충돌 · 출처 · 노후
3단 구조(유사도 후보 → 모델 판정 → 사람 채택)를 구현했습니다. 채택 결과는 기존 `active` 플래그로 반영되어 **표시가 아니라 실제 답변을 바꿉니다.** 문서 메타 8필드를 추가해 "어디서 왔는지"와 "검토 기한이 지났는지"가 답변 가능해졌습니다.

---

## 3. 설계에서 의도적으로 선택한 것

**단일 스냅샷 테이블 + `dimension` 축.** 4축을 각각 테이블로 만들면 집계 잡·조회 API·화면이 4벌이 됩니다. 하나로 통일해 각각 한 벌만 유지되고, 다섯 번째 렌즈는 스키마 변경 없이 추가됩니다.

**스냅샷, 실시간 집계 아님.** retention 퍼지가 365일에 대화를 하드 삭제하므로 원본 기반 통계는 퍼지 순간 자기 이력을 잃습니다.

**미리보기 필터는 session 대상.** `getOrCreateConversation`이 항상 `channel='widget'`을 쓰므로 `conversation.channel`로 거르면 샌드박스가 전부 통과합니다.

**스코프 밖 대화는 404.** 구분 가능한 403은 "그 대화가 다른 상담원 큐에 존재한다"를 알려줍니다.

**감사 쓰기는 best-effort.** 로깅 실패가 대화 중인 상담원을 막아서는 안 됩니다.

**충돌 판정에 모델이 필요한 이유.** "$29.99 이상 무료배송"과 "$19.99 이상 무료배송"은 거의 동일한 벡터이면서 양립 불가능한 사실입니다. 유사도만으로는 구분되지 않습니다.

---

## 4. 구현 중 발견해 고친 것

### 4-1. 타임존 (실데이터에서 발견)
집계가 11건 중 **0건**을 반환했습니다. MySQL 컨테이너는 UTC이고 커넥션이 `timezone: 'Z'`인데 bare date를 서버 로컬(KST)로 파싱해 창이 9시간 밀린 것이 원인입니다. 날짜 전용 입력을 **UTC 기준으로 통일**하고 스펙으로 고정했습니다.

> 단위 테스트만으로는 잡히지 않았을 결함입니다 — 목(mock)에는 타임존이 없습니다.

### 4-2. REQ 초판 오류 정정 (v1.0.1)
초판의 **B1 "메시지에 tenant_id가 기록되지 않는다"는 사실이 아니었습니다.** `TenantSubscriber.beforeInsert`가 요청 컨텍스트에서 자동 스탬프하며 실측 40건 전부 채워져 있습니다. 쓰기 코드에 `tenantId`가 없는 것만 보고 단정한 것이 오류였습니다. ④의 선행조건에서 제외하고, 잔존 위험(요청 밖 쓰기·다중 테넌트 토큰 미해석)만 명시 스탬프로 차단했습니다.

### 4-3. 함께 해소한 기존 결함
| # | 결함 | 조치 |
|---|---|---|
| B2 | 이력 상세 라우트 부재(404) | S1에서 신설 |
| B3 | `customerName`·`startedAt`이 항상 `—` | 응답에 추가. `summary`는 생성 주체가 없어 **제거** |
| **B4** | **감사 로그를 볼 수 있는 사용자가 없음** | `ADMIN_CAPS`에 `TENANT_AUDIT_READ` 추가 + 테넌트 `/work-log` 라우트 |
| B5 | 감사 `actor` 컬럼 항상 `—` | 배치 2쿼리로 이름 해석 |
| B6 | `EVENTS.CONVERSATION_LOG` 구독자 없이 발행 | 제거 |
| — | 문서 목록에 `source` 미표시 | 렌더링 추가 |
| — | `unresolvedTopN` 이름/실제 불일치 | 주석으로 명시(하위호환 위해 필드명 유지) |
| — | `popularQuestions`가 최근 목록 | 스냅샷 기반 실제 집계로 교체 |

**B7(이관 기능·`CONVERSATION_ASSIGN`)은 범위에서 제외**했습니다. 담당자 변경은 별도 요구사항이며, `assignments`는 이번에 읽기 전용으로만 활용했습니다.

---

## 5. 파일

### 신규 (백엔드)
```
apps/api/src/global/util/date-range.util.ts (+spec)
apps/api/src/domain/analytics/entity/question-stat-daily.entity.ts
apps/api/src/domain/analytics/entity/question-cluster.entity.ts
apps/api/src/domain/analytics/keyword.util.ts (+spec)
apps/api/src/domain/analytics/question-stats.service.ts (+spec)
apps/api/src/domain/analytics/analytics.service.spec.ts
apps/api/src/domain/knowledge/entity/kb-conflict.entity.ts
apps/api/src/domain/knowledge/kb-conflict.service.ts (+spec)
sql/migration_question_stats.sql
sql/migration_kb_provenance.sql
```

### 신규 (프론트엔드)
```
apps/web/src/domain/history/ConversationTranscript.tsx
apps/web/src/domain/work-log/{WorkLogPage.tsx, work-log.service.ts, work-log.hooks.ts}
apps/web/src/domain/statistics/{StatisticsPage.tsx, TrendChart.tsx, statistics.service.ts, statistics.hooks.ts}
apps/web/src/domain/knowledge/ConflictReview.tsx
apps/web/src/i18n/locales/{en,es,ko}/{workLog,statistics}.json
```

### 주요 수정
`analytics.{service,controller,module}.ts` · `audit.{service,controller,module}.ts` ·
`chat.service.ts` · `scenario.service.ts` · `agent.{service,console.controller}.ts` ·
`message.entity.ts` · `kb-document.entity.ts` · `knowledge.{service,controller,mapper,module}.ts` ·
`permission-matrix.ts` · `HistoryPage.tsx` · `KnowledgePage.tsx` · `KnowledgeQaPanel.tsx` ·
`AuditPage.tsx` · `nav-config.ts` · `rbac.ts` · `AppRouter.tsx` · `i18n.ts`

---

## 6. 테스트 결과

| 항목 | 결과 |
|---|---|
| API 단위·통합 | **416 통과** (354 → +62) |
| common | 13 통과 (+1) |
| types | 10 통과 |
| 모노레포 typecheck·build | 16 태스크 전부 통과 |
| 실부팅 | 각 단계 + 최종 main 확인, 스케줄러 등록 로그 확인 |
| 실데이터 집계 | 11 질문 → 47 스냅샷 행, 재실행 시 중복 없음 |
| 마이그레이션 | 재적용 무동작 / scratch DB에서 생성 경로·백필 확인 |

상세는 `docs/test/TCR-Ops-Logs-Stats-KnowledgeConflict-20260804.md` 참조.

---

## 7. 배포 상태

| 환경 | 코드 | 마이그레이션 | 상태 |
|---|---|---|---|
| main | `ec3fcf9` | — | 머지 완료 |
| **staging** | `ec3fcf9` | **2건 적용 완료** | **배포 완료 2026-08-04** |
| production | 미배포 | 미적용 | 대기 |

### 스테이징 배포 실적

| 단계 | 결과 |
|---|---|
| 스키마 스냅샷 | `/home/shoptalk/backup-pre-opslog-20260804-071037.sql` |
| SQL 선적용 | `migration_question_stats.sql` · `migration_kb_provenance.sql` |
| 스키마 검증 | `question_stats_daily`·`question_clusters`·`kb_conflicts` 생성, `messages` +2컬럼 +인덱스, `kb_documents` +8컬럼 |
| 코드 배포 | `deploy-staging.sh`, 전 컨테이너 재생성 |
| 부팅 | `Nest application successfully started` + `Question stats scheduled every 24h` + `Qdrant connected` |
| 라우트 | `/analytics/questions` · `/analytics/conversations/:id` · `/knowledge/conflicts` · `/audit` **전부 401**(대조군 미존재 라우트는 404 → 실제 라우트 매칭 확인) |
| SQL 오류 | 30분 스캔 0건 |
| 웹 콘솔 | 200 |

### 백필 실적

| 항목 | 결과 |
|---|---|
| 통계 백필 | 2026-07-01 ~ 08-03, **141 질문 → 450 스냅샷 행** |
| 축별 | document 69키/194 · category 40키/194 · keyword 266키/469 · cluster 76키/141 |
| 클러스터 | 40개 그룹, 141 멤버, **누락 일자 0** |
| 충돌 스캔 | 229 문서 → 후보 121쌍 → 판정 36건 → **상충 1 · 중복 28 · 보완 7** |

검출된 상충 1건은 실제로 유효합니다 — "Shipping & Delivery"가 표준 배송 3~5영업일이라고 하는 반면 "2.1.2 Estimated Delivery"는 발송 후 기준을 달리 서술합니다. 중복 28건은 초기 시드 FAQ와 정책 문서 임포트가 겹친 것으로 보입니다.

> ⚠️ **충돌 스캔은 1회 실행당 판정 40건 상한**입니다. 후보 121쌍 중 36건만 판정됐으므로, 나머지를 소진하려면 **스캔을 몇 차례 더 실행**해야 합니다.

---

## 8. 배포 중 발견해 고친 결함

배포는 계획대로 진행됐지만, **실제 데이터에 닿고 나서야 드러난 결함이 3건** 있었습니다. 전부 배포 과정에서 수정·재배포했습니다.

| # | 결함 | 영향 | 수정 |
|---|---|---|---|
| D1 | **백필이 모든 문서의 `updated_at`을 덮어씀** | `kb_documents.updated_at`은 `ON UPDATE CURRENT_TIMESTAMP`라, `created_at`을 시드하는 UPDATE가 230건 전부를 "마이그레이션 시각에 편집됨"으로 만듦 — **노후 판정이 읽는 신호를 지움** | `updated_at`을 자기 값에 명시 대입해 자동 갱신 억제 (#93). `created_at`이 이전 값을 보존하고 있어 230건 전부 정확히 복구 |
| D2 | **클러스터링이 stub 벡터를 수용** | Voyage 429 시 게이트웨이가 stub으로 폴백하는데 이를 그대로 사용 → 실제 벡터와 공간을 공유하지 않는 **영구 죽은 클러스터** 생성 | 키 설정 상태의 stub 결과를 실패로 처리, 해당 실행의 클러스터 축만 건너뜀 (#94). 지식 색인이 이미 쓰던 가드와 동일 |
| D3 | **충돌 스캔이 문서당 1회 요청** | 229 문서 = 229 요청. 어댑터는 단일 텍스트를 재시도하지 않으므로(라이브 채팅 정지 방지 가드) **throttle 즉시 통째로 실패** — 스캔 완료 불가 | 64건 배치로 4회 요청 (#95). 수정 후 스캔 정상 완료 |

**세 결함 모두 로컬 테스트로는 드러나지 않았습니다.** D1은 scratch DB 검증이 `created_at` 시드만 확인하고 `updated_at` 보존은 확인하지 않아 통과했고, D2·D3은 로컬이 stub 어댑터라 rate limit 자체가 발생하지 않습니다.

각 수정에 회귀 테스트를 추가했습니다(+6, 총 **420건**).

---

## 9. 남은 작업

| 항목 | 성격 |
|---|---|
| 콘솔 화면 클릭 검증 | 비밀번호가 운영자 보유 — **사람 확인 필요** |
| 충돌 스캔 추가 실행 | 후보 121쌍 중 36건만 판정됨(회당 40건 상한) |
| **Voyage 결제수단 등록** | 무료 티어 rate limit이 배포 중 반복 관측됨. 프로덕션 트래픽 전 필수 |
| 저볼륨 일자의 클러스터 축 | 질문 1건인 날은 단일 텍스트 임베딩이라 재시도 없이 실패 가능(라이브 채팅 보호 가드와의 상호작용) |
| A3 한국어 키워드 품질 | 2-gram 기준. 실 트래픽 축적 후 형태소 분석기 도입 여부 판단 |
| 문서 검토주기 기본값 일괄 설정 | 정책 문서 236건에 카테고리별 기본 주기 부여 검토 |
| B7 대화 이관 기능 | 별도 요구사항으로 분리됨 |

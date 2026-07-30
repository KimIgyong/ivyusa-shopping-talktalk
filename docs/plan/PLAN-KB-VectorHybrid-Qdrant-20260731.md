# PLAN — KB 벡터 하이브리드 검색 도입 (MySQL + Qdrant)

- 작성일: 2026-07-31
- 결정사항: 아키텍처 = **MySQL(소스 오브 트루스) + Qdrant(벡터 인덱스)**, 임베딩 = **Voyage `voyage-4`**
  (다국어 KO/EN/ES 교차언어), 하이브리드 = MySQL FULLTEXT + Qdrant dense, RRF 병합
- 근거 문서: `docs/analysis/AN-MysqlQdrant-vs-PostgreSQL-20260731.md` 및 선행 분석 3본
- 연계 작업: 정책 문서 KB 등록(`AN-PolicyDoc-KB-Registration-20260731.md`)과 병행 —
  본 계획 완료 시 등록된 KB가 의미 검색 대상이 됨

---

## 1. 목표 / 비목표

**목표**
1. 자연어·구어체 질의의 KB 매칭(의미 검색) — KO/EN/ES 교차언어 포함
2. 유사도 기반 confidence로 상담 이관(escalation) 판단 교체 — 현행 건수 기반(1건=0.62) 제거
3. Qdrant 장애·미설정 시 현행 FULLTEXT로 무중단 폴백
4. 테넌트 격리: 모든 벡터 질의에 `tenant_id` 필터 강제

**비목표(이번 범위 제외)**
- 상품 지식자료·게시판·Drive 소스 청킹 파이프라인 (후속)
- sparse 벡터 기반 Qdrant 내부 하이브리드 (후속 — 이번엔 앱 레벨 RRF)
- 관리 웹 UI 변경 (KB UI 정비는 별도 과제)

## 2. 아키텍처 개요

```
[KB 쓰기]  KnowledgeService ──(MySQL 커밋)──▶ kb_documents
                └─(성공 후)──▶ EmbeddingSyncService ──▶ Voyage embed ──▶ Qdrant upsert
                                   └─ 실패 시 RabbitMQ 재시도 큐 + 주기 재색인 배치

[검색]     RagService.retrieve(tenantId, query)
                ├─ (a) MySQL FULLTEXT top-k          ─┐
                ├─ (b) Voyage embed(query) → Qdrant   ├─▶ RRF 병합 → top-4 → 프롬프트
                │      dense top-k (tenant filter)   ─┘
                └─ confidence = Qdrant 최고 유사도 (임계 미달 → 이관)
                └─ Qdrant/Voyage 실패 → (a)만으로 폴백(현행 동작)
```

## 3. 작업 분해 (WBS)

### W1. 인프라 — Qdrant 컨테이너 (0.5d)
- `docker/docker-compose.dev.yml`: `qdrant/qdrant` 서비스 추가, 호스트 포트 **6343**(기본 6333
  재매핑 — 기존 포트 정책과 동일 방식), 볼륨 `qdrant_data`
- `docker/staging/docker-compose.staging.yml`, `docker/production/docker-compose.production.yml` 동일 추가
- `env/backend/.env.development` 등: `QDRANT_URL=http://localhost:6343`, `VOYAGE_API_KEY=`(빈 값 허용)

### W2. 임베딩 어댑터 — `AiAdapter.embed()` (1d)
- `packages/types` `AI_FUNCTION`에 `EMBEDDING: 'embedding'` 추가
- `ai-adapter.interface.ts`: `AiEmbeddingRequest {texts, inputType: 'query'|'document', model}` /
  `AiEmbeddingResult {vectors, tokensIn, provider, model}` + `AiAdapter.embed?()` (옵셔널 —
  기존 어댑터 비파괴)
- 신규 `adapters/voyage.adapter.ts`: Voyage REST `/v1/embeddings` 호출, `input_type` 반영,
  기본 모델 `voyage-4`(1024차원), 배치(문서 다건) 지원, 키는 AES 암호화 저장 규약 준수
- `stub.adapter.ts`: 해시 기반 결정적 의사 벡터 구현 — 무키 개발환경에서 전체 플로우 동작
- `ai-gateway.service.ts`: `embed()` 라우팅 추가(엔진 라우팅 실패 시 stub 폴백 — 기존 패턴 동일)

### W3. Qdrant 클라이언트 + 동기화 (1.5d)
- `@qdrant/js-client-rest` 도입, `infrastructure/external/vector/qdrant.service.ts`:
  컬렉션 `kb_documents`(1024차원, dot — Voyage 정규화 벡터), payload 인덱스
  `tenant_id`/`category`/`active`, `ensureCollection()` 부트스트랩
- **필터 강제 시그니처**: `search(tenantId: number, vector, opts)` — tenantId 없는 검색 메서드를
  노출하지 않음 (전역 문서 `tenant_id IS NULL`은 `should` 조건으로 포함)
- `knowledge.service.ts`: `embed()` 스텁 교체 — create/update 시 `AiGateway.embed(document)` →
  `qdrant.upsert(point{id: kb_id, vector, payload})`, delete/active 변경 시 반영.
  `kb_documents`에 `embedding_model` varchar(64)·`embedded_at` datetime 컬럼 추가
  (`sql/migration_kb_embedding.sql` — 스테이징 적용 절차 포함)
- **정합성**: upsert 실패 시 RabbitMQ `kb.embed.retry` 큐 재시도(지수 백오프 3회) +
  재색인 커맨드 `npm run kb:reindex`(전량/`--since` diff, `embedding_model` 불일치 재임베딩)

### W4. 하이브리드 검색 — `RagService` 개편 (1.5d)
- `retrieve()`: (a) 현행 FULLTEXT top-8, (b) 질의 임베딩 → Qdrant top-8(tenant 필터) →
  **RRF(k=60) 병합** → 상위 4건. 스니펫 400→**800자** 상향(프롬프트 예산 ~3.2K자, 허용 범위)
- **confidence 교체**: Qdrant 최고 유사도(dot) 기반으로 산출, 임계값 env
  `RAG_MIN_SIMILARITY`(초기 0.5, 튜닝 대상). 벡터 결과 부재(폴백 모드) 시 현행 건수식 유지
- 폴백: Voyage/Qdrant 예외 → FULLTEXT 단독(현행 `retrieveLike` 체인 유지), 로그 경고
- POL-013(`knowledge_store` 우선) 정렬 규칙 병합 후에도 유지

### W5. 검증 (1d)
- 평가 세트: 정책 문서 기반 대표 질의 30개(KO/EN 각 12, ES 6 — 교차언어 케이스 포함:
  KO 질의→EN 문서). 기대 문서 top-4 적중률을 FULLTEXT 단독 vs 하이브리드로 비교 기록
- 이관 동작: 무관 질의("오늘 날씨") → confidence 임계 미달 → 상담 이관 확인
- 테넌트 격리: 타 테넌트 KB 미노출 확인 (교차 테넌트 질의 테스트)
- 장애 주입: Qdrant 중지 상태에서 챗봇 정상 응답(폴백) 확인
- `npm run build` / `typecheck` + 기존 시드·데모 플로우 회귀 확인
- 결과는 `docs/test/T-KB-VectorHybrid-*.md` + 구현 보고서로 기록

## 4. 순서·일정 (총 5.5d, 순차 기준)

| 순서 | 작업 | 산출물 | 의존 |
|---|---|---|---|
| 1 | W1 인프라 | compose/env 변경 | — |
| 2 | W2 임베딩 어댑터 | voyage/stub embed | — (W1과 병행 가능) |
| 3 | W3 동기화 | qdrant.service, 마이그레이션, 재색인 | W1, W2 |
| 4 | W4 하이브리드 검색 | rag.service 개편 | W3 |
| 5 | W5 검증 | 평가 리포트 | W4 + 정책 KB 등록 완료 |

- 브랜치: `feature/kb-vector-hybrid` → PR(squash) — 저장소 규약 준수
- 스테이징 배포 시: Qdrant 서비스 추가 → `migration_kb_embedding.sql` 적용 → `kb:reindex` 1회

## 5. 리스크·완화

| 리스크 | 완화 |
|---|---|
| Voyage 키 미발급/미설정 | stub 의사 벡터로 개발 진행, 폴백 경로로 운영 무영향. 키 발급은 선행 조치 항목 |
| 유사도 임계값 오설정(이관 과다/과소) | W5 평가 세트로 초기값 캘리브레이션, env로 무배포 조정 |
| RRF 병합 후 무관 문서 상위 노출 | k·가중 튜닝, 필요 시 후속으로 rerank-2.5 도입 |
| 동기화 유실 | 재시도 큐 + `kb:reindex` diff 배치 — 최종 일관성 |
| 단일 서버 메모리 | 1024차원 × 수천 건 ≈ 수십 MB — 무시 가능. 확장 시 양자화 옵션 |

## 6. 선행 조치 (사용자/운영 확인 필요)
1. **Voyage AI API 키 발급** (https://voyageai.com) — 스테이징/운영 env 등록(개발은 stub로 무관)
2. 스테이징 서버 디스크·포트(6343) 확인
3. 정책 KB 등록 작업과의 순서: KB 등록(FULLTEXT 운영) 선행 → 본 작업 배포 시 `kb:reindex`로
   기등록분 일괄 임베딩 — 등록을 기다릴 필요 없음

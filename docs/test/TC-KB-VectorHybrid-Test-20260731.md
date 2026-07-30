# TC — KB 벡터 하이브리드 검색 테스트 리포트

- 테스트일: 2026-07-31
- 대상: `feature/kb-vector-hybrid` 브랜치 (PLAN-KB-VectorHybrid-Qdrant W1~W4 구현분)
- 환경: 로컬 dev 스택 — MySQL 8.0(:3316) · Qdrant v1.15.1(:6343) · Redis 7 · RabbitMQ 3.13,
  임베딩 = **stub**(`VOYAGE_API_KEY` 미설정, 결정적 의사 벡터), 시드 KB 12건(tenant=ivyusa/1)
- 테스트 하니스(재실행 가능, 저장소 포함):
  - `apps/api/src/database/verify-hybrid.ts` — T1~T6 (정상 경로)
  - `apps/api/src/database/verify-fallback.ts` — T7 (Qdrant 장애 경로, 수동으로 컨테이너 중지 후 실행)

---

## 1. 결과 요약

| 구분 | 항목 | 결과 |
|---|---|---|
| 정적 검증 | `npm run build` (turbo 5 tasks) | ✅ PASS |
| 정적 검증 | `npm run typecheck` (7 tasks) | ✅ PASS |
| 색인 | `kb:reindex` 초기 색인 | ✅ 12/12 임베딩, Qdrant points=12 (dim 1024, Dot) |
| 색인 | `kb:reindex --force` 전량 재색인 | ✅ 12/12 (워크스페이스 실행 시 플래그 전달 확인) |
| 기능 | T1~T6c (verify-hybrid) | ✅ **9/9 PASS** |
| 장애 | T7a~c (verify-fallback, Qdrant 중지) | ✅ **3/3 PASS** |

**총평: 전 항목 통과.** 테스트 과정에서 결함 2건을 발견·수정 후 재검증 완료(§3).

## 2. 케이스별 상세

| ID | 검증 내용 | 기대 | 실측 | 판정 |
|---|---|---|---|---|
| T1 | EN 질의 하이브리드 검색 — 벡터 레그 유사도 병합 | 청크 반환 + similarity 채워짐 | chunks=4, top="CS Policy — Returns", sim=0.062 | ✅ |
| T2 | KO 혼합 질의 파이프라인 (토크나이즈·융합 동작) | 청크 반환 | chunks=4 | ✅ |
| T3 | 스니펫 400→800자 확장 | 400 초과 스니펫 존재 | 최장 602자(문서 원문 길이 한도) | ✅ |
| T4a | 스텁 모드 confidence = 기존(pre-hybrid) 건수식 유지 | on-topic ≥ 0.5 | 0.950 | ✅ |
| T4b | 보정(voyage) 모드 confidence 매핑 | sim 0.72→0.72 · sim 0.31→0.2 · 결과없음→0.2 (임계 0.5) | 정확 일치 | ✅ |
| T5 | 테넌트 격리 — 타 테넌트(99999) 질의 | tenant 1 문서 미노출 | chunks=0 | ✅ |
| T6a | KB 생성 → Qdrant 동기화 | 생성 즉시 벡터 검색 가능, status=embedded | point 존재 확인 | ✅ |
| T6b | active=0 토글 → 벡터 검색 제외 | 최종 일관성(≤3s) 내 제외 | 제외 확인 (detached setActive) | ✅ |
| T6c | KB 삭제 → Qdrant 포인트 제거 | 검색 결과에서 소멸 | 제거 확인 | ✅ |
| T7a | **Qdrant 중지** 상태 retrieve | FULLTEXT 단독으로 계속 동작 | chunks=4, similarity 전부 null | ✅ |
| T7b | Qdrant 중지 상태 answer | 응답 생성 + 건수식 confidence | confidence=0.950, 텍스트 정상 | ✅ |
| T7c | Qdrant 중지 상태 KB 쓰기 | 요청 성공, status='pending'(재시도 예약→reindex 스윕) | pending 확인, API 무장애 | ✅ |

## 3. 테스트 중 발견·수정된 결함 (모두 재검증 통과)

1. **Qdrant 포인트 ID 400 거부** — MySQL bigint PK가 런타임에 문자열(`"10"`)로 반환되어
   (알려진 bigint-PK-as-string 특성) Qdrant가 point ID로 거부 → 전 문서 색인 실패.
   *수정*: `QdrantService` 경계에서 id/tenant_id `Number()` 강제.
2. **RRF 융합 키 불일치** — 같은 원인으로 FULLTEXT 레그(문자열 id)와 벡터 레그(숫자 id)의
   Map 키가 어긋나 벡터 결과가 전부 탈락(similarity 미반영). *수정*: 융합 경계 id 정규화.
3. **(설계 보강) 무관 문서 유입 방지** — Qdrant는 점수 무관 최근접 k건을 항상 반환하므로
   off-topic 질의가 무관 문서로 패딩되는 문제 → `VECTOR_SCORE_FLOOR`(0.01) 도입 및
   **비보정(stub) 벡터는 순위 보정만 가능, 문서 유입은 불가** 규칙 추가. 유사도 기반
   confidence는 보정된 실제 임베딩(voyage)일 때만 적용.

## 4. 알려진 제약 (설계상 허용, 후속 확인 항목)

1. **스텁 모드의 의미 검색 품질은 검증 대상 아님** — 스텁은 파이프라인 기계 검증용.
   KO↔EN 교차언어 검색 품질 평가는 **Voyage 키 설정 후** `verify-hybrid.ts`를 스테이징에서
   재실행하고 `RAG_MIN_SIMILARITY` 임계값을 캘리브레이션해야 한다(선행 조치: 키 발급).
2. off-topic 라틴 문자 질의가 ngram 바이그램으로 FULLTEXT에 일부 매칭되는 현상은
   **기존(pre-hybrid) 동작 그대로**이며, 실키 모드에서는 유사도 임계로 걸러진다.
3. Qdrant 장애 중 삭제된 문서의 포인트는 고아로 남을 수 있으나, 검색 시 MySQL 재검증
   (hydration 필터)으로 노출되지 않음. `kb:reindex --force`가 정합 복구 수단.
4. `--force` 플래그는 워크스페이스 실행에서만 전달됨:
   `npm run kb:reindex --workspace=@ivy/api -- --force` (루트 `npm run kb:reindex -- --force`는 미전달).

## 5. 배포 절차 (스테이징)

1. `.env.staging`에 `QDRANT_URL=http://qdrant:6333`, `VOYAGE_API_KEY=<발급 키>`,
   `VOYAGE_MODEL=voyage-4`, `RAG_MIN_SIMILARITY=0.5` 추가
2. compose 재기동(qdrant 서비스 신규 생성). DB 컬럼은 `DB_SYNCHRONIZE=true`로 자동 반영
   (수동 적용 시 `sql/migration_kb_embedding.sql`)
3. `npm run kb:reindex --workspace=@ivy/api` 1회 — 기존 KB 전량 색인
4. `verify-hybrid.ts` 스모크 실행 및 대표 질의로 위젯 실검증, 임계값 튜닝

## 6. 변경 파일 목록

| 구분 | 파일 |
|---|---|
| 인프라 | `docker/docker-compose.dev.yml`, `docker/staging/docker-compose.staging.yml`, `docker/production/docker-compose.production.yml`, `env/backend/.env.development` |
| 타입 | `packages/types/src/common/enum.types.ts` (AI_FUNCTION.EMBEDDING) |
| AI 어댑터 | `ai-adapter.interface.ts`(embed 계약), `adapters/voyage.adapter.ts`(신규), `adapters/stub.adapter.ts`(의사 벡터), `ai-gateway.service.ts`(embed 라우팅), `ai.module.ts` |
| 벡터 | `infrastructure/external/vector/qdrant.service.ts`(신규), `vector.module.ts`(신규), `app.module.ts` 등록 |
| KB | `kb-document.entity.ts`(embedding_model/embedded_at), `knowledge.service.ts`(임베딩 동기화·재시도·reindexAll) |
| RAG | `chat/rag.service.ts`(하이브리드 RRF·confidence·폴백) |
| 스크립트 | `database/kb-reindex.ts`(신규), `database/verify-hybrid.ts`(신규), `database/verify-fallback.ts`(신규), `apps/api/package.json`·루트 `package.json`(kb:reindex) |
| SQL | `sql/migration_kb_embedding.sql`(신규) |

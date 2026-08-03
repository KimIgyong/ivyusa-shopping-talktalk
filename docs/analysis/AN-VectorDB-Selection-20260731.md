# AN — 벡터 임베딩 최적화 데이터베이스 추천

- 작성일: 2026-07-31
- 선행 문서: `AN-KB-Retrieval-FulltextVsVector-20260731.md` (FULLTEXT vs 벡터 비교, 단계별 도입 로드맵)
- 요구사항: ShopTalk KB/RAG의 벡터 임베딩 저장·검색에 최적화된 데이터베이스 추천

---

## 1. 선정 기준 (ShopTalk 환경 제약)

| 기준 | 근거 |
|---|---|
| 기존 스택 적합성 | NestJS + TypeORM + **MySQL 8.0** + **Redis 7** + RabbitMQ, 단일 서버 Docker Compose 배포(스테이징 shoptalk.amoeba.site) |
| 멀티테넌트 필터링 | 모든 검색이 `tenant_id`(+ `active`, `category`) 필터와 결합되어야 함 — 벡터 검색과 메타데이터 필터의 동시 지원 필수 |
| 하이브리드 검색 | 키워드(정확 매칭) + 벡터(의미 매칭) 병합이 목표 아키텍처 |
| 규모 | 현재 ~160건(정책 KB) → 중기 수천~수만 건(상품 지식·게시판·Drive 소스) |
| 운영 부담 | 전담 인프라 인력 없음 — 컨테이너 1개 추가가 상한, 백업·업그레이드 단순해야 함 |
| 벡터 사양 | Voyage `voyage-4` 기준 1024차원(256/512 축소 가능), 정규화 벡터(dot=cosine) |

## 2. 후보 비교

| 후보 | 인프라 추가 | ANN 인덱스 | 메타데이터 필터 | 하이브리드(키워드+벡터) | Node 클라이언트 | 평가 |
|---|---|---|---|---|---|---|
| **MySQL(JSON) + 앱 내 코사인** (Phase 1) | 없음 | 없음(브루트포스) | SQL 그대로 | 앱에서 RRF 병합 | TypeORM 그대로 | ~수천 건까지 충분, 개발비용 최소 |
| **Qdrant** | 컨테이너 1개 | HNSW | **강함**(payload filter, 필터-인식 인덱스) | **내장**(dense+sparse, RRF/Query API 융합) | 공식 `@qdrant/js-client-rest` | **Phase 2 1순위** |
| **Redis 8 (Query Engine/Vector Sets)** | 없음(이미지 `redis:7→8` 교체) | HNSW | 태그/숫자 필터 | 부분(앱 병합 필요) | node-redis(FT.SEARCH) | **Phase 2 2순위** — 인프라 0 추가가 강점, 단 캐시·저장 혼용 및 AOF 영속화 설정 필요 |
| pgvector (PostgreSQL) | RDBMS 1개 추가 | HNSW/IVFFlat | SQL | pg FTS와 결합 가능 | TypeORM 지원 | 기술적으론 우수하나 **MySQL과 이중 RDBMS 운영**이 되어 이 프로젝트엔 비권장 |
| MySQL 9.x `VECTOR` | 메이저 업그레이드 | **커뮤니티판 ANN 인덱스 없음**(HeatWave 전용) | SQL | FULLTEXT와 동일 DB | TypeORM | 브루트포스면 Phase 1 방식과 차이 없음 — 업그레이드 리스크 대비 이득 없음, 비권장 |
| Elasticsearch/OpenSearch | 무거운 컨테이너(+JVM) | HNSW | 강함 | **단일 엔진 BM25+kNN** | 공식 클라이언트 | 하이브리드는 최강이나 메모리·운영 부담이 규모 대비 과함 |
| Milvus / Weaviate | 다중 컴포넌트 | 다양 | 지원 | 지원 | 지원 | 수백만 벡터급 전용 — 명백한 오버스펙 |

## 3. 추천

### 결론: 단계별 2안
**Phase 1(정책 KB ~수천 건): DB 교체·추가 없음** — `kb_documents`에 `embedding` JSON 컬럼을 추가하고
앱 내 코사인(브루트포스) 계산. 1024차원 × 수천 건은 수 ms로 충분하며, 기존 MySQL 백업·트랜잭션·
tenant 필터를 그대로 사용한다. *"벡터에 최적화된 DB"를 지금 도입하는 것보다, 도입이 필요해지는
규모(수만 건)까지 무추가로 버티는 것이 최적화다.*

**Phase 2(상품 지식·외부 소스 확장, 수만 건~): Qdrant 1순위 권장**
- 근거:
  1. **경량 단일 컨테이너**(Rust, JVM 없음) — 현 단일 서버 Compose 구성에 서비스 1개 추가로 끝.
  2. **payload 필터가 1급 기능** — `tenant_id`/`category`/`active` 필터를 HNSW 탐색과 결합(필터-인식
     인덱싱)해 멀티테넌트 격리 성능이 우수. POL-019/테넌트 격리 요구와 직결.
  3. **하이브리드 내장** — dense+sparse 벡터와 Query API의 RRF 융합을 엔진 안에서 처리 →
     MySQL FULLTEXT와의 앱 레벨 병합보다 단순한 최종 형태로 이행 가능.
  4. 스냅샷 백업, 스칼라/이진 양자화(메모리 절감), 공식 JS/TS 클라이언트, Apache-2.0 오픈소스
     (셀프호스팅 무료) + 필요 시 관리형(Qdrant Cloud) 이전 경로.
- MySQL은 원문·메타데이터의 소스 오브 트루스로 유지하고, Qdrant에는 `{vector, tenant_id, kb_id,
  category, language}`만 동기화(등록/수정 시 upsert, 삭제 시 제거).

**Phase 2 대안(운영 최소화 우선 시): Redis 8**
- `redis:7-alpine` → `redis:8` 이미지 교체만으로 벡터 검색(HNSW)·필터 확보 — 서비스 수 증가 0.
- 단, 현재 Redis는 캐시/레이트리밋 용도라 **영속화(AOF) 설정과 키스페이스 분리**가 전제이고,
  하이브리드 병합은 앱에서 수행해야 한다. "컨테이너 1개도 늘리기 싫다"면 이 안, 검색 품질·기능
  확장성을 우선하면 Qdrant.

### 비권장 사유 요약
- **pgvector**: 제품은 훌륭하나 MySQL 프로젝트에 Postgres를 추가하면 RDBMS 2종 운영(백업·계정·
  모니터링 이중화). Postgres로의 전면 이전 계획이 없는 한 부적합.
- **MySQL 9 VECTOR**: 커뮤니티 에디션에 ANN 인덱스가 없어 실질 이득이 브루트포스와 동일 —
  메이저 업그레이드 리스크만 부담.
- **Elasticsearch/OpenSearch, Milvus, Weaviate**: 현 규모·운영 여력 대비 과함.

## 4. 도입 스케치 (Phase 2 · Qdrant 기준)

```yaml
# docker-compose 추가 예시
qdrant:
  image: qdrant/qdrant:latest
  ports: ["6333:6333"]          # REST (dev 포트 정책에 맞춰 재매핑)
  volumes: ["qdrant_data:/qdrant/storage"]
```

- 컬렉션: `kb_documents` (1024차원, cosine/dot), payload 인덱스: `tenant_id`(keyword),
  `category`(keyword), `language`(keyword), `active`(bool)
- 동기화 지점: `KnowledgeService.createDocument/updateDocument/deleteDocument` → embed 후 Qdrant upsert
- 검색: `RagService.retrieve()`에서 Qdrant Query API(dense[+sparse] RRF) → 실패 시 MySQL FULLTEXT 폴백
- 재색인 배치: `embedding_model` 버전 변경 시 전량 재임베딩 커맨드(수만 건도 배치로 수 분 내)

## 5. 최종 요약

| 시점 | 추천 | 한 줄 근거 |
|---|---|---|
| 지금(Phase 1) | **MySQL JSON 컬럼 + 앱 내 코사인** | 현 규모에 벡터 DB는 불필요 — 무추가 인프라로 의미 검색 확보 |
| 확장 시(Phase 2) | **Qdrant** (1순위) | 경량 단일 컨테이너 + 테넌트 필터 + 하이브리드 내장 |
| 대안 | Redis 8 | 이미지 교체만으로 도입 — 운영 최소화 우선일 때 |

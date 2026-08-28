# REQ-260828 — 지식그룹 OperationInfo 추가 · CounselInfo 일괄등록 · go2joy 운영지식 입력

- 작성일: 2026-08-28
- 요청 유형: [요구사항]
- 관련 문서: `docs/analysis/REQ-260804-Knowledge-ProductGroup-SourceIngestion.md` (D2: doc_group 도입),
  `reference/go2joy-hotel-admin-kb.md` (운영지식 원천)

## 1. 요구사항 원문

1. 지식베이스 문서의 지식그룹에 CounselInfo, ProductInfo 레벨에 추가로 **OperationInfo**를 추가한다.
2. **CounselInfo 일괄등록 기능** 추가 (엑셀, CSV 업로드 / 샘플파일 제공 모달).
3. OperationInfo는 `reference/go2joy-hotel-admin-kb.md`를 참조하여 **go2joy 테넌트에 운영지식정보를 입력**한다.

## 2. AS-IS

### 2.1 지식그룹 구조
- 지식그룹은 `apps/api/src/domain/knowledge/entity/kb-document.entity.ts:11-18`의 닫힌 상수
  `DOC_GROUP = { COUNSEL: 'counsel', PRODUCT: 'product' }`.
- DB는 `kb_documents.doc_group VARCHAR(16) NOT NULL DEFAULT 'counsel'`
  (`sql/migration_kb_doc_group.sql`; `group`이 MySQL 예약어라 `doc_group`).
  인덱스 `idx_kb_group (tenant_id, doc_group)`,
  유니크 `uk_kb_extkey (tenant_id, doc_group, external_key)` — **새 그룹이 추가되어도 그룹별
  external_key 네임스페이스가 자동 격리**됨.
- "CounselInfo"/"ProductInfo"라는 문자열은 i18n 라벨뿐:
  `apps/web/src/i18n/locales/{ko,en,es}/knowledge.json`의 `group.{all,counsel,product}`.
- 콘솔 그룹 탭은 `apps/web/src/domain/knowledge/KnowledgePage.tsx:855-877`에 **하드코딩된 3개
  탭 배열**(전체/counsel/product). 카운트는 `useCategories()` 결과를 `c.group`으로 접어 산출.
- 생성 DTO는 `@IsIn(Object.values(DOC_GROUP))`으로 그룹을 검증(`knowledge.request.ts:74-88`)
  → 상수에 값을 추가하면 API 검증은 자동 확장.

### 2.2 문서 생성·임포트 경로
- 단건 생성: `POST /knowledge/documents` — 단, **콘솔 웹은 `doc_group`을 보내지 않아**
  (`apps/web/src/domain/knowledge/knowledge.service.ts:343-351`) 수기 문서는 전부 counsel 고정.
  수정 DTO에도 `doc_group`이 없어 **그룹 간 이동 불가**.
- 응답 매퍼 `KnowledgeMapper.toDocument`(`knowledge.mapper.ts:63-88`)가 `docGroup`/`externalKey`를
  **응답에 싣지 않음** → 프런트 타입의 `docGroup?`은 항상 undefined (행별 그룹 표시 불가).
- 일괄 임포트 선례(재사용 대상): **상품 CSV 임포트**
  - `POST /knowledge/documents/import/product` (`knowledge.controller.ts:347-376`) —
    `FileInterceptor`, 메모리 저장(컨테이너 디스크 비영속), 5MB/1파일, 확장자 `.csv` 검증.
  - 파서는 의존성 없는 자체 구현 `csv.util.ts`(BOM, 따옴표, CRLF 처리, 테스트 존재).
    **엑셀(xlsx) 파서는 저장소에 없음.**
  - `product-import.service.ts` — 필수 컬럼 검증, MAX 5,000행,
    `(tenant_id, doc_group, external_key)` 업서트, 행별 오류 리포트
    `{parsed, created, updated, skipped, invalid, errors[]}`.
  - 2단계 임베딩: 행은 `status='pending'`으로 저장 후 `embedDocuments()` 배치 임베딩
    (단건 임베딩은 rate limit 사망 이력, PR #95).
  - 샘플파일: `apps/web/public/samples/kb-product-import-sample.csv` +
    `KnowledgeGuides.tsx`의 HelpModal에서 다운로드 링크 제공.
  - 감사: `revisions.recordAudit(..., 'knowledge.products_imported', ...)`.
- 시드/CLI: `seed.runner.ts`(그룹 미지정=counsel), `kb-import.ts`(`(tenant, title)` 멱등,
  `active:0` 검수 게이트).

### 2.3 그룹이 흘러가는 하류 경로
- 검색 편향: `chat.service.ts:785-786` — intent가 product면 `preferGroup=PRODUCT`,
  `rag.service.ts` `GROUP_BONUS=0.002`.
- 충돌 감지: `kb-conflict.service.ts:99` — `Not(DOC_GROUP.PRODUCT)`만 제외 →
  새 그룹은 기본적으로 충돌 감지 대상에 포함됨.
- Qdrant 페이로드에는 doc_group 없음(그룹 필터는 MySQL/재랭킹 단계).
- 카테고리 에이전트 스코프는 `kb_categories.agent_ids`(문서가 아니라 카테고리 축).

### 2.4 go2joy 운영지식 원천
`reference/go2joy-hotel-admin-kb.md` (512줄, ko+en 병기):
- 호텔 파트너 어드민 매뉴얼을 **작업 단위 KB 아티클 18건**(GTJ-DSH/REV/DIS/FLS/SUR/QLK/LCK/RPT)
  으로 재구성. RAG 임베딩·상담 응대에 바로 쓰도록 독립 검색·인용 가능하게 작성됨.
- 아티클 템플릿: `목적 → 진입 경로 → 절차 → 주의사항 → 관련 항목`. ID 규칙 `GTJ-{영역}-{일련번호}`.
- 영역(카테고리 후보): 대시보드 / 리뷰 관리 / 객실 유형 관리 / 리포트 (+ 용어집·상태값 정의 섹션).
- 3건은 "보완 필요"(GTJ-SUR-01/02, GTJ-RPT-01) — 원문 매뉴얼 미기재 항목 존재.
- go2joy 테넌트는 스테이징에 존재(복수 AI 에이전트 E2E 등에 사용 중).

## 3. TO-BE

1. **OperationInfo 그룹**: `DOC_GROUP.OPERATION='operation'` 추가. 콘솔 탭 전체/CounselInfo/
   ProductInfo/OperationInfo 4개. `'operation'`(9자) ≤ VARCHAR(16) → **스키마 변경 불필요**.
2. **일괄등록**: 콘솔 지식문서 화면에 [일괄등록] 진입 → 모달에서 샘플파일(CSV·XLSX) 다운로드,
   파일 업로드(.csv/.xlsx), 결과 통계·행별 오류 표시. 기본 대상 그룹은 CounselInfo이되
   OperationInfo에도 동일하게 사용 가능(요구 3의 실행 수단을 겸함).
3. **go2joy 운영지식 입력**: 참조 md를 아티클 단위로 분해(아티클 ID=external_key, 영역=카테고리)
   → 일괄등록 파이프라인으로 go2joy 테넌트에 `doc_group='operation'`으로 등록·임베딩.

## 4. 갭 분석

| # | 갭 | 조치 |
|---|---|---|
| G1 | `DOC_GROUP`에 operation 없음 | 상수 1곳 추가(DTO 검증 자동 확장) |
| G2 | 콘솔 탭 하드코딩(3개) + i18n `group.*` 키 부재 | 탭 배열 + ko/en/es `group.operation` 추가 |
| G3 | 콘솔 생성 요청이 `doc_group` 미전송 → 전부 counsel | 활성 탭의 그룹을 생성 요청에 전달 |
| G4 | 응답 매퍼가 `docGroup` 미노출 → 행별 그룹 확인 불가 | 매퍼에 `docGroup`(+`externalKey`) 추가 |
| G5 | counsel/operation용 일괄등록 경로 없음(상품 전용뿐) | 범용 일괄등록 API+모달 신설(상품 임포트 패턴 재사용) |
| G6 | 엑셀 파서 부재 | xlsx 파싱 라이브러리 도입(PLN에서 선정) |
| G7 | go2joy 테넌트에 운영지식 0건 | 참조 md → 임포트 파일 변환 스크립트 + 스테이징 등록 |
| G8 | 새 그룹의 검색 편향/충돌 감지 정책 미정의 | PLN에서 결정(기본: 충돌 감지 포함, 검색 편향은 보류) |

## 5. 사용자 흐름 (TO-BE)

```
[테넌트 콘솔 /knowledge]
  탭: [전체] [CounselInfo] [ProductInfo] [OperationInfo]
   │
   ├─ CounselInfo/OperationInfo 탭에서 [일괄등록] 클릭
   │    → 모달: ① 샘플파일 다운로드(csv/xlsx) ② 파일 선택 ③ 업로드
   │    → 결과: 생성 n / 갱신 n / 스킵 n / 오류 n건(행·사유)  → 배치 임베딩(pending→embedded)
   │
   └─ 문서 단건 추가 시: 활성 탭의 그룹으로 생성됨(전체 탭이면 CounselInfo)

[운영자(이번 작업)]
  reference/go2joy-hotel-admin-kb.md
   → 변환 스크립트(아티클 분해: external_key=GTJ-*, category=영역)
   → 스테이징 go2joy 테넌트에 일괄등록(operation) → 임베딩 → 위젯 질의 스모크
```

## 6. 제약·전제

- 일괄등록 권한: 기존 knowledge 라우트와 동일하게 `CAPABILITY.KNOWLEDGE_SOURCE_MANAGE`.
- 업로드는 메모리 저장·5MB·5,000행 상한(상품 임포트와 동일 기준).
- CSV 인코딩: 한국어 Windows 엑셀의 CSV 저장은 CP949가 흔함 → **UTF-8(BOM 허용) 명시** +
  xlsx 직접 업로드 지원으로 인코딩 문제 우회.
- 카테고리 자동 생성 시 기존 카테고리의 `agent_ids` 스코프를 **덮어쓰지 않음**
  (ensure()가 범위를 덮은 이력 — PR #387~#391 교훈).
- 임베딩은 반드시 배치 경로(`embedDocuments`) 사용, AI/모더레이션 파이프라인 무변경.
- 스키마 변경 없음 → PR에 `## Migration` 섹션 불필요(단, 신규 샘플파일·정적 자산 배포 확인 필요).
- 문서 워크플로우: 본 REQ → PLN 승인 후 구현 → TCR → RPT.
- 잔여 리스크: go2joy 원천 문서의 "보완 필요" 3건은 미완 내용임을 문서 상태(비활성 또는
  내용 내 표기)로 반영할지 PLN에서 결정.

# PLN-260828 — 지식그룹 OperationInfo 추가 · 일괄등록(CSV/XLSX) · go2joy 운영지식 입력

- 작성일: 2026-08-28
- 근거: `docs/analysis/REQ-260828-KB-OperationInfo-BulkImport.md`
- 원칙: 상품 CSV 임포트(PR #95 계열) 패턴 최대 재사용, 스키마 변경 없음, 적정기술(오버엔지니어링 지양)

## 0. 설계 결정 (승인 시 확정)

| # | 결정 | 선택안 (권고) | 근거 |
|---|---|---|---|
| D1 | 그룹 값 | `DOC_GROUP.OPERATION = 'operation'` | VARCHAR(16) 내(9자) → SQL 마이그레이션 0건 |
| D2 | 엑셀 지원 | **xlsx 업로드 직접 지원, 파서는 `exceljs`**(API 전용 의존성, 첫 워크시트만 읽기) | 한국어 엑셀의 CSV 저장이 CP949로 깨지는 문제를 원천 우회. SheetJS(npm `xlsx`)는 레지스트리 정체+보안권고로 제외 |
| D3 | 일괄등록 API | 그룹 범용 단일 엔드포인트 `POST /knowledge/documents/import/bulk` (form 필드 `doc_group`: counsel\|operation) | 요구 2(CounselInfo)와 요구 3(OperationInfo 입력 수단)을 한 파이프라인으로. product는 기존 전용 임포트 유지 |
| D4 | 파일 포맷 | 컬럼 `category, title, content, external_key?, source_url?` — 필수 3개. external_key 있으면 `(tenant, doc_group, external_key)` 업서트, 없으면 `(tenant, doc_group, title)` 매칭 갱신/생성 | 재업로드 멱등성. go2joy 아티클은 `GTJ-*` ID를 external_key로 사용 |
| D5 | go2joy 입력 경로 | 변환 스크립트로 md→CSV 생성 → **신규 일괄등록 API를 스테이징 go2joy 테넌트에 실호출** | 기능의 실전 E2E 검증을 데이터 입력과 겸함 |
| D6 | "보완 필요" 3건(GTJ-SUR-01/02, RPT-01) | **활성으로 등록**(원문에 이미 "보완 필요/Updating" 표기가 본문 내 존재 → AI가 한계를 인지하고 안내 가능) | 비활성이면 해당 주제 질문에 아예 무근거 답변 위험 |
| D7 | 하류 정책 | 충돌 감지: operation **포함**(현행 로직 그대로, 코드 무변경). 검색 그룹 편향(preferGroup): operation은 **이번엔 미적용** | 운영지식 충돌은 감지 가치 있음. 편향 휴리스틱은 근거 데이터 없이 추가하지 않음 |
| D8 | 문서 생성 그룹 | 콘솔 단건 추가 시 **활성 탭의 그룹**으로 생성(전체 탭=counsel). 수정 DTO의 그룹 이동은 이번 범위 제외 | G3 해소 최소 변경 |

## 1. 단계별 계획

### S1 — 백엔드 (apps/api)
1. `kb-document.entity.ts` — `DOC_GROUP`에 `OPERATION: 'operation'` 추가
   (create DTO `@IsIn`은 자동 확장).
2. `knowledge.mapper.ts` — `toDocument`에 `docGroup`, `externalKey` 노출 (G4).
3. **일괄등록 신설**
   - `bulk-import.service.ts` (신규): 파일 버퍼 → 확장자별 파싱
     (.csv → 기존 `csv.util.ts` / .xlsx → `exceljs` 첫 시트) → 공통 레코드 검증
     (필수 컬럼, 내용 길이, MAX 5,000행) → D4 업서트 → `status='pending'` 저장
     → `embedDocuments()` 배치 임베딩 → `{parsed, created, updated, skipped, invalid, errors[]}`.
   - 카테고리는 **없을 때만 생성**(기존 `agent_ids` 스코프 절대 미변경 — ensure() 덮어쓰기 교훈).
   - `knowledge.controller.ts` — `POST /knowledge/documents/import/bulk`
     (`FileInterceptor`, 메모리 저장, 5MB/1파일, 확장자 `.csv|.xlsx`,
     `@RequireCapability(KNOWLEDGE_SOURCE_MANAGE)`), 감사 `knowledge.bulk_imported`.
   - 거부 사유는 `logger.warn`(4xx 무로그 함정).
4. `packages/types` widget citation의 `group` 타입이 리터럴 유니언이면 `'operation'` 포함으로 확장.
5. 단위 테스트: 파싱(xlsx/csv/BOM/CP949 거부), 업서트 멱등, 행 오류 리포트, 상한 초과.
6. **실부팅 검증**(entity 변경 아님이지만 모듈 배선 변경 → `successfully started` 확인).

### S2 — 콘솔 (apps/web)
1. `KnowledgePage.tsx` 탭 배열에 `{ key:'operation', label:t('group.operation') }` 추가.
2. i18n `ko/en/es` `knowledge.json` — `group.operation: "OperationInfo"` + 일괄등록 모달 키 일괄 추가
   → `npm run i18n:check`.
3. 단건 추가 모달: 활성 탭 그룹을 `doc_group`으로 전송 (D8).
4. **일괄등록 모달** (신규, counsel/operation 탭에서만 버튼 노출):
   샘플 다운로드(csv+xlsx, `public/samples/kb-bulk-import-sample.{csv,xlsx}`) · 파일 선택 ·
   업로드(`apiPostForm`) · 결과 통계/행별 오류 표시 · 성공/실패 토스트(자동/수동 닫기, i18n).
5. 문서 행에 그룹 뱃지 표시(매퍼 노출분 소비 — "만든 토큰 미소비" 함정 방지).

### S3 — go2joy 운영지식 입력
1. `scripts/convert-go2joy-kb.mjs` (신규, 순수 node): `reference/go2joy-hotel-admin-kb.md`를
   아티클 단위로 분해 → CSV 생성.
   - 아티클 18건: `external_key=GTJ-*`, `category=영역`(대시보드/리뷰 관리/객실 유형 관리/리포트),
     `title=아티클명(KO·EN)`, `content=템플릿 전문(목적~관련 항목, ko+en 병기 유지)`.
   - 부록 2건 추가: 용어집(§5), 상태값 정의(§6) → `external_key=GTJ-GLS-01/GTJ-STA-01`. 총 20건.
2. 스테이징 go2joy 테넌트로 일괄등록 API 실호출(운영자 자격) → 임베딩 완료 확인
   (`status='embedded'`) → 위젯/콘솔 `ask` 스모크 3문항(예: "리뷰 답글 몇 번 달 수 있어?" →
   1회 제한 인용 확인).
3. 재실행 멱등 확인(같은 파일 재업로드 → created 0 / updated 20).

### S4 — 마무리
- TCR `docs/test/TCR-260828-…` / RPT `docs/implementation/RPT-260828-…` (PR#·SHA·배포 상태).
- SPEC.md: 엔드포인트·DOC_GROUP 항목 갱신. PR 1~2건(`feature/*`→squash), 스키마 변경 없음
  → `## Migration` 불필요. 스테이징 배포 검증: 신규 라우트 401=배포됨 확인, 샘플파일 정적 자산 확인.

## 2. UI 와이어프레임 (필수)

```
/knowledge  ─ 지식 문서
┌────────────────────────────────────────────────────────────────────┐
│ [전체 123] [CounselInfo 87] [ProductInfo 28] [OperationInfo 20]    │  ← 탭 4개(신규 1)
│                                                                    │
│  카테고리 ▼   상태 ▼   검색 [__________]      [일괄등록] [+ 문서 추가] │  ← 일괄등록: counsel/operation 탭에서만
│ ┌──────────────────────────────────────────────────────────────┐   │
│ │ 제목                │ 그룹        │ 카테고리   │ 상태   │ …   │   │  ← 그룹 뱃지(신규)
│ │ 리뷰 답글 등록      │ Operation   │ 리뷰 관리  │ 활성   │ …   │   │
│ └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘

[일괄등록 모달]
┌─ 문서 일괄등록 (CounselInfo) ────────────────── ✕ ─┐
│  ① 샘플파일을 내려받아 형식에 맞게 작성하세요.       │
│     [⬇ CSV 샘플]  [⬇ Excel 샘플]                   │
│     필수: category, title, content                  │
│     선택: external_key, source_url                  │
│  ② 파일 업로드 (.csv / .xlsx, 최대 5MB·5,000행)     │
│     ┌───────────────────────────────┐               │
│     │   파일을 끌어오거나 클릭       │               │
│     └───────────────────────────────┘               │
│                              [취소]  [업로드]        │
├─ 업로드 결과 ───────────────────────────────────────┤
│  생성 18 · 갱신 2 · 스킵 0 · 오류 1                  │
│  ⚠ 3행: content 누락                                │
└─────────────────────────────────────────────────────┘
```

## 3. 측면 영향 분석

| 영역 | 영향 | 대응 |
|---|---|---|
| DB 스키마 | 없음(`'operation'` ≤ VARCHAR(16), 유니크키 이미 그룹 축 포함) | SQL 0건 — pre-deploy-check 부담 없음 |
| 기존 문서 | doc_group 기본값 counsel 그대로 — 무영향 | — |
| 상품 임포트/카탈로그 동기화 | 무변경(전용 경로 유지) | — |
| 충돌 감지 | operation 문서가 감지 대상에 포함(현행 로직 그대로) | D7 의도된 동작 |
| RAG/위젯 | 편향 미적용; citation `group='operation'` 신규 값 흐름 | 타입 유니언 확장 여부 확인(S1-4) |
| 카테고리 스코프 | 일괄등록의 카테고리 자동 생성 시 기존 행 미변경 | ensure-if-absent만 사용 |
| 매퍼 노출 확대 | `docGroup/externalKey` 응답 추가 — 기존 소비처는 옵셔널 필드라 무해 | 프런트 타입 이미 옵셔널 |
| 의존성 | `exceljs` 1건 추가(apps/api) | 파싱 전용, 프런트 번들 무영향 |
| 시드/CLI | 무변경(counsel 기본 유지) | — |

## 4. 리스크·엣지 케이스

- CP949 CSV 업로드 → UTF-8 디코딩 실패 시 행 오류가 아닌 **파일 단위 명확한 오류 메시지**
  (사유 분리 원칙 — "실패 문구는 갈라라").
- xlsx 수식/서식 셀 → 문자열 값만 취득(exceljs `cell.text`), 수식 결과 없으면 오류 행 처리.
- 대용량 붙여넣기 content(400자 스니펫 함정과 무관 — kb_documents.content는 TEXT) 상한만 검증.
- 임베딩 실패 행은 `pending` 잔류 → 기존 `reindexAll()` 스윕이 회수(신규 메커니즘 불필요).
- go2joy 실호출은 스테이징 한정, 시크릿은 `secrets/` 기존 자격 사용.

## 5. 검증 계획 요약 (TCR에서 상세화)

- 단위: csv/xlsx 파서, 업서트 멱등, 검증 오류 행 리포트, 카테고리 스코프 보존.
- 통합: 업로드→임베딩→목록/카운트 반영, 탭 카운트, i18n check, 실부팅.
- E2E(스테이징): go2joy 20건 등록 → 위젯 질의 스모크 3문항 → 재업로드 멱등.

---
**승인 요청**: D1~D8 결정 포함 본 계획으로 구현 진행 여부를 확인해 주세요.

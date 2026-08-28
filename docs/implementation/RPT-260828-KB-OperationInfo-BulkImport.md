# RPT-260828 — 지식그룹 OperationInfo · 일괄등록(CSV/XLSX) · go2joy 운영지식 입력

- 요구/계획/테스트: `docs/analysis/REQ-260828-…` → `docs/plan/PLN-260828-…`(승인) →
  `docs/test/TCR-260828-KB-OperationInfo-BulkImport.md`
- **PR #431** (squash) — main `5bd9510`, 2026-08-28

## 1. 무엇이 바뀌었나

1. **지식그룹 OperationInfo** — `DOC_GROUP.OPERATION='operation'` 추가. 콘솔 `/knowledge`
   탭 4개(전체/Counsel/Product/Operation), 전체 탭에 그룹 뱃지 컬럼, 문서 추가 시 활성 탭
   그룹으로 생성(기존: 무조건 counsel), 응답 매퍼가 `docGroup`/`externalKey` 노출.
2. **일괄등록** — `POST /knowledge/documents/import/bulk` (`doc_group`=counsel|operation;
   product는 기존 전용 임포터 유지). CSV(자체 파서) + **XLSX(exceljs)** — 한국어 엑셀의
   CP949 CSV 문제를 xlsx 직접 업로드로 우회. `(tenant, doc_group, external_key)` 업서트
   + 제목 폴백(첫 키 업로드 시 키 채택), 무변경 skip·미임베딩 재큐, 2단계 배치 임베딩,
   행별 오류 리포트, 파일 단위 실패 사유 5종 분리(**E5061~E5065**), 감사
   `knowledge.bulk_imported`. 콘솔 모달(샘플 csv/xlsx 다운로드·결과 통계·행 오류·토스트,
   6개 언어).
3. **go2joy 운영지식** — `scripts/convert-go2joy-kb.mjs`가
   `reference/go2joy-hotel-admin-kb.md`를 아티클 20건(18 + 용어집·상태값,
   `external_key=GTJ-*`, 카테고리=영역)으로 변환 → 신규 API로 스테이징 go2joy 테넌트에
   등록.

## 2. 파일

- API: `domain/knowledge/{bulk-import.service.ts, xlsx.util.ts, bulk-import.service.spec.ts}`(신규),
  `kb-document.entity.ts`(DOC_GROUP·BULK_IMPORT_GROUPS), `knowledge.{controller,service,mapper,module}.ts`,
  `dto/request/knowledge.request.ts`(BulkImportRequest), `global/constant/error-code.constant.ts`(E5061~65),
  기존 스펙 2건 목 슬롯 갱신
- Web: `domain/knowledge/{KnowledgePage.tsx, knowledge.service.ts, knowledge.hooks.ts}`,
  i18n 6개 로케일 `knowledge.json`, `public/samples/kb-bulk-import-sample.{csv,xlsx}`(신규)
- 공통: `packages/types` citation 주석, `SPEC.md` §6.3, `scripts/convert-go2joy-kb.mjs`(신규),
  `reference/go2joy-hotel-admin-kb.md`(원천 편입), 의존성 `exceljs@4.4.0`(apps/api)

## 3. 테스트 결과 (상세: TCR)

- 단위 13케이스 신규 · 전체 **166 suites / 1,718 green** · typecheck 9/9 · i18n 6개 언어 complete
- 로컬 실부팅 `successfully started` + HTTP 스모크(생성 20→임베딩 20, 멱등 skip 20,
  xlsx→counsel 기본, `doc_group=product` 거부)

## 4. 배포 상태

| 항목 | 상태 |
|---|---|
| PR / SHA | #431 / main `5bd9510` |
| 마이그레이션 | **없음** (doc_group VARCHAR(16)에 'operation' 수용, sql/ 추가분 0) |
| 스테이징 배포 | 2026-08-28 `deploy-staging.sh` — api 컨테이너 재생성·healthy, 부팅 로그 `successfully started` |
| 배포 검증 | bulk 라우트 **401**(=배포됨) · `/samples/kb-bulk-import-sample.{csv,xlsx}` **200** · health ok · 콘솔 200 |
| go2joy 데이터 | **20건 created + 20건 embedded(실 Voyage)** · 재업로드 20 skipped(멱등) · 카테고리 5종 카운트 정확 |
| ask 스모크 | 3/3 정답·정확 인용(리뷰 답글 1회 제한→GTJ-REV-01 · 플래시 세일 중지→GTJ-FLS-03 · 순매출 공식→GTJ-DSH-01+용어집) |
| 프로덕션 | 미배포(호스트 미정 — 기존 잔여 항목) |

## 5. 운영 메모 / 잔여

- go2joy 재등록·개정: 원본 md 수정 → `node scripts/convert-go2joy-kb.mjs` → 콘솔
  OperationInfo 탭 [일괄등록] 재업로드(멱등: GTJ-* 키 기준 갱신).
- "보완 필요" 3건(GTJ-SUR-01/02, RPT-01)은 원문 표기 유지한 채 활성(PLN D6) — 원문 매뉴얼
  보완 시 재변환·재업로드.
- 검색 그룹 편향(preferGroup)은 operation 미적용(PLN D7) — 운영 데이터 쌓인 뒤 필요 시 별도 검토.
- 문서 그룹 이동(수정 DTO의 doc_group)은 범위 외로 미구현(REQ G3는 생성 경로만 해소).

## 6. 예방 패턴

- **생성자 중간 주입 추가는 위치 기반 목을 깨뜨린다** — `KnowledgeService`에 파라미터 1개
  삽입으로 기존 스펙 2건이 "recordSyncState is not a function"류로 실패. 새 의존성은 끝쪽
  삽입을 우선하고, 전체 스위트로 즉시 검증.
- **md→KB 변환기의 헤딩 경계는 명시 규칙으로** — "아무 헤딩이나 flush"는 아티클 내부
  소제목(`### 1)`)에서 본문을 잘랐다(대시보드 1128→200자). 경계는 챕터(`# `)와 번호
  그룹(`## n.n`)만으로 한정.

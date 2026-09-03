# TCR-260903 — 지식베이스 일괄 다운로드·업데이트 + 범용 상담가이드

- 근거: PLN-260903 (승인 2026-09-03) / REQ-260903
- 실행 환경: 로컬 (MySQL :3316, API :3211, 시드 tenant ivyusa=1)

## 1. 단위 테스트 (Jest)

### 신규 `bulk-export.service.spec.ts` (6건)
| # | 케이스 | 결과 |
|---|--------|------|
| U1 | `toCsv` — 쉼표·따옴표·개행 이스케이프 후 `parseCsv`로 원복 | PASS |
| U2 | exportRows가 tenant+group+active=1 필터·정렬로만 조회 | PASS |
| U3 | null 컬럼(category/content/key/url) → 빈 문자열 매핑, 컬럼 순서 = import 계약 | PASS |
| U4 | CSV 버퍼가 UTF-8 BOM(EF BB BF)으로 시작 | PASS |
| U5 | CSV 라운드트립: export → `parseCsvRecords` → 레코드 동일(한국어·개행·따옴표 포함) | PASS |
| U6 | XLSX 라운드트립: export → `parseXlsxRecords` → 레코드 동일 | PASS |

### 보강 `bulk-import.service.spec.ts` (+1건)
| # | 케이스 | 결과 |
|---|--------|------|
| U7 | 빈 category 행 = 미분류(null)로 생성, invalid 아님, 카테고리 ensure 미호출 — export 라운드트립의 전제 | PASS |

### 회귀
- knowledge 모듈 전체: **33 스위트 / 357 테스트 PASS**
- API 전체: **180 스위트 / 1,805 테스트 PASS**
- `npm run typecheck` 9/9 · `npm run build` 전체 green · `npm run i18n:check` 6개 언어 complete

## 2. 통합 시나리오 (로컬 실서버, dist 부팅)

| # | 시나리오 | 기대 | 결과 |
|---|----------|------|------|
| I1 | 엔티티/모듈 변경 후 실부팅 | `Nest application successfully started` | PASS |
| I2 | 미인증 `GET /knowledge/documents/export` | 401 (라우트 배포 확인) | PASS |
| I3 | counsel CSV export → 무수정 재업로드 | 전행 skipped | PASS (240/240 skipped) |
| I4 | counsel XLSX export → 재업로드 | 전행 skipped (CSV·XLSX 동등성) | PASS (240/240) |
| I5 | product CSV export → 재업로드 | 전행 skipped (product 일괄등록 신규 허용) | PASS (144/144) |
| I6 | 1행 수정 후 재업로드 (external_key 유지) | 해당 행만 updated | PASS (updated=1) |
| I7 | Content-Disposition 파일명 | `kb-counsel-260903.csv` | PASS |
| I8 | 범용 상담가이드 CSV 업로드 | 90행 생성·임베딩 | PASS (created=90, embedded=90) |
| I9 | 범용 상담가이드 XLSX 재업로드 | 전행 skipped (두 포맷 내용 동일 증명) | PASS (90/90 skipped) |
| I10 | 잘못된 doc_group / format | 400 E1005 | PASS (DTO/컨트롤러 검증) |

## 3. 엣지 케이스

| # | 케이스 | 처리 |
|---|--------|------|
| E1 | category가 NULL인 기존 문서(export→'') | **I5에서 결함으로 발견** → 임포터가 빈 category를 미분류로 수용하도록 수정(U7). 수정 전 5행 invalid → 수정 후 0 |
| E2 | 내용에 쉼표·큰따옴표·개행 포함 문서 | U1/U5/U6 라운드트립으로 보증 |
| E3 | 문서 0건 그룹 export | 헤더만 있는 파일 정상 생성 |
| E4 | 한국어 엑셀 인코딩 | CSV에 BOM 부여(U4), CP949 재저장은 기존 E5061 거부 유지 |
| E5 | 범용 가이드 언어 혼입 | KO/EN 행 분리, external_key `GUIDE-*`/`GUIDE-*-EN` — 같은 행에 두 언어 미혼입(생성기에서 구조적으로 보장) |

## 4. 잔여 리스크
- 동기화 소유 문서(source≠knowledge_store)를 일괄 업데이트로 수정하면 다음 동기화가
  되돌릴 수 있음 — 설계상 허용(PLN D4), 모달 안내 문구로 고지.
- 스테이징 실검증(3그룹 다운로드→업로드)은 배포 후 RPT에 기록.

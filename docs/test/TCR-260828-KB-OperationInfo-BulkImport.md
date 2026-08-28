# TCR-260828 — 지식그룹 OperationInfo · 일괄등록(CSV/XLSX) 테스트

- 근거: `docs/plan/PLN-260828-KB-OperationInfo-BulkImport.md`
- 실행 환경: 로컬(워크트리 `session/kb-operation-bulk`), MySQL 3316 · stub 임베더

## 1. 단위 테스트 (Jest)

`apps/api/src/domain/knowledge/bulk-import.service.spec.ts` — 13케이스 신규.

| # | 케이스 | 결과 |
|---|---|---|
| U1 | CSV → operation 그룹 문서 생성, `status='pending'`(배치 임베딩 위임), CREATE 리비전 | ✅ |
| U2 | 카테고리 ensure 호출(존재 시 무변경 — agent_ids 스코프 보존) | ✅ |
| U3 | 헤더 대소문자 무시(`Category`,`TITLE`) | ✅ |
| U4 | external_key 업서트(내용 변경 → updated + pending 재큐) | ✅ |
| U5 | 제목 폴백 매칭 + 파일의 external_key 채택(수기 문서 위 첫 키 업로드) | ✅ |
| U6 | 무변경 skip / 미임베딩(pending) 행은 skip이어도 재큐 | ✅ |
| U7 | 파일 내 중복 external_key·중복 제목 → 행 오류(마지막 행 승리 방지) | ✅ |
| U8 | 빈 값·255/64/512자 초과 → 행 오류로 보고(임포트 중단 없음) | ✅ |
| U9 | 필수 컬럼 누락 → E5063 | ✅ |
| U10 | 데이터 행 0 → E5065 | ✅ |
| U11 | CP949 CSV → E5062(파일 단위, 사유 분리) | ✅ |
| U12 | .xls 등 미지원 확장자 → E5061 | ✅ |
| U13 | .xlsx 워크북 파싱(서식-빈 행 무시) → 동일 파이프라인 | ✅ |

기존 스위트 회귀: **166 suites / 1,718 tests 전부 통과**
(기존 `knowledge.service.{list,syncerror}.spec.ts` 2건은 생성자 목 슬롯 추가로 갱신).

## 2. 통합 검증 (로컬 실서버 HTTP)

빌드 후 `node dist/main.js` 실부팅 — `Nest application successfully started` 확인.

| # | 시나리오 | 결과 |
|---|---|---|
| I1 | 미인증 `POST /knowledge/documents/import/bulk` → 401 (라우트 존재) | ✅ |
| I2 | go2joy 변환 CSV 20행 업로드(`doc_group=operation`) → `created:20, embedded:20` | ✅ |
| I3 | 동일 파일 재업로드 → `skipped:20, created:0` (멱등) | ✅ |
| I4 | 샘플 .xlsx 업로드(`doc_group` 생략) → counsel 기본값, `created:3` | ✅ |
| I5 | `categories/counts?group=operation` → 카테고리 5종·20건 정확 집계 | ✅ |
| I6 | `doc_group=product` → E5003 검증 거부(전용 임포터 보호) | ✅ |
| I7 | `npm run typecheck` 9/9 · `npm run i18n:check` 6개 언어 complete | ✅ |

## 3. 변환 스크립트 (`scripts/convert-go2joy-kb.mjs`)

- 아티클 18건 + 부록 2건(용어집 GTJ-GLS-01, 상태값 GTJ-STA-01) = **20건**, 전부 본문 비어있지 않음.
- 내부 소제목(`### 1) 예약 개요`, `## 직접 할인 프로그램 상태`)이 본문에 보존되는지 확인
  (초기 버전은 여기서 잘림 — 경계 규칙을 챕터/번호 그룹 헤딩으로 한정해 수정).
- 보완 필요 3건(GTJ-SUR-01/02, RPT-01)은 원문 표기 그대로 활성 등록(PLN D6).
- 제외: §7 보완 필요 항목(메타), §8 변경 이력.

## 4. 엣지 케이스 메모

- 임베딩 실패 행은 `pending` 잔류 → 기존 `reindexAll()` 스윕이 회수(신규 장치 불요).
- Qdrant 페이로드는 doc_group 미포함(기존과 동일) — 그룹 필터는 MySQL 축.
- 충돌 감지는 operation 포함(D7, 코드 무변경) — `Not(PRODUCT)` 로직 그대로.
- 그룹 뱃지 컬럼은 전체 탭에서만 렌더(그룹 탭에서는 탭 라벨과 중복).

## 5. 스테이징 검증 계획 (배포 후 RPT에 기록)

1. 배포 확인: 신규 라우트 401/404/502 판별, 컨테이너 age, 부팅 로그.
2. 샘플파일 정적 서빙 확인(`/samples/kb-bulk-import-sample.{csv,xlsx}` 200).
3. go2joy 테넌트 실업로드 20건 → `status='embedded'`(실 Voyage) 확인.
4. 콘솔 `/knowledge` OperationInfo 탭 카운트·문서 목록 확인.
5. ask 스모크 3문항(예: "리뷰 답글 몇 번 달 수 있어?" → GTJ-REV-01 인용).
6. 동일 파일 재업로드 멱등 확인.

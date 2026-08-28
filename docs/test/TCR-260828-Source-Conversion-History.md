# TCR-260828 지식 소스 전환 내역 모달 — 테스트 케이스

- 근거: `docs/plan/PLN-260828-Source-Conversion-History.md` (승인: 모달로 진행)

## 1. 유닛 (자동 — `knowledge.service.syncerror.spec.ts` 확장 2케이스)

| # | 케이스 | 기대 |
|---|---|---|
| U1 | 동기화 실패 시 | 감사에도 `{sourceId, status:'failed', error}` 기록 — 이력이 성공만 남던 반쪽 해소 |
| U2 | `listSourceRuns` | tenant+action+JSON sourceId 필터·최신순, 구(pre-feature) 행은 status 기본 'ok', actorId 0→null, sourceId/type/status는 result에서 분리 |
| — | 회귀 | 전체 **165 suites / 1,705 tests 통과**, typecheck·build·i18n:check(6언어)·실부팅(모듈에 AuditLog 엔티티 추가) ✅ |

## 2. 스테이징 스모크 (배포 후, go2joy)

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | `GET /knowledge/sources/7/runs` | 8/28 실행들(성공 3 — 예산 30/120/200 회차) 최신순, truncated·elapsedMs 포함. 과거 실패는 미표시(사전 고지 문구) |
| S2 | 소스 이름 클릭 → 모달 | 요약(유형·대상·마지막 동기화) + 실행 이력 표 + 전환 문서 1건(embedded·노출) |
| S3 | 문서 제목 클릭 | 전환 내역 모달 닫힘 → 기존 문서 상세 모달 열림 |
| S4 | 문서 0건 소스(gdrive/board) | 실행 이력·문서 모두 빈 상태 문구, 에러 없음 |
| S5 | 실패 1회 유발 후 재조회 | failed 행이 사유와 함께 이력에 추가(신규 기록 경로 실증) |
| S6 | 타 테넌트 소스 id로 runs 호출 | 404 (테넌트 펜스) |

결과는 RPT-260828-Source-Conversion-History에 기록.

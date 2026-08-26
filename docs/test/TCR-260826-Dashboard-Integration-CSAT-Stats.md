# TCR-260826 대시보드 연동상태 항목명 + 만족도 통계 — 테스트 케이스

- 근거: `docs/plan/PLN-260826-Dashboard-Integration-CSAT-Stats.md`

## 1. 유닛 (자동, `agent.service.csat.spec.ts` 신규 5케이스)

| # | 케이스 | 기대 |
|---|---|---|
| U1 | summary 명시 기간 | tenant+ended 상태+`BETWEEN :from :to` 조립, 분포 5버킷 숫자화 |
| U2 | summary 기간 생략 | 오늘 종료·29일 전 시작(최근 30일), 평가 0건이면 avg=null |
| U3 | 상담원별 귀속 | `COALESCE(agent_id, 마지막 agent 발화자)` 식 포함, 이름 조회 tenant 펜스, NULL 귀속=미배정 행 |
| U4 | 세션 목록 필터 | rating·귀속 agent 필터 where 조립, `csat_rating IS NOT NULL` |
| U5 | 세션 행 매핑 | 문자열 id 픽스처 — name null→email 폴백, channel null→widget |

전체 스위트 **157 suites / 1,663 tests 통과** (2026-08-26). typecheck·build·i18n:check(6언어)·실부팅 ✅.
대시보드 수정 중 **동일 결함을 어드민 개요 페이지에서도 발견·동시 수정**(`i.provider` → `i.name` — 계약 정정이 tsc로 드러냄).

## 2. 스테이징 수동 스모크 (배포 후)

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | /dashboard 연동상태 | 7항목 전부 이름 표시, yotpo=error + "Yotpo returned 404" detail + 동기화 시각 |
| S2 | /admin 개요 연동 카드 | 항목명 정상 표시(동일 수정) |
| S3 | /statistics 만족도 탭 요약 | 평균·응답수·응답률·분포가 DB 값과 일치 |
| S4 | 상담원별 표 | 귀속 규칙(assigned/발화자) 반영, 미배정 행 표기 |
| S5 | 세션별 목록 | 평점·상담원 필터, 페이지네이션, 행 클릭 → /live-chat 딥링크 |
| S6 | 기간 필터 | from/to 변경 시 세 블록 동시 갱신, 평가 0건 기간=빈 상태 문구 |
| S7 | 권한 | ANALYTICS_READ 없는 계정 403 (기존 stats와 동일) |

결과는 RPT-260826-Dashboard-Integration-CSAT-Stats에 기록.

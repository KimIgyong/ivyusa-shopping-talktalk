# RPT-260826 대시보드 연동상태 항목명 + 만족도 통계 — 구현 보고

- REQ: `docs/analysis/REQ-260826-Dashboard-Integration-CSAT-Stats.md`
- PLN: `docs/plan/PLN-260826-Dashboard-Integration-CSAT-Stats.md` (승인: 전체 진행)
- TCR: `docs/test/TCR-260826-Dashboard-Integration-CSAT-Stats.md`

## 배포 상태

| 항목 | 값 |
|---|---|
| PR | **#401** (squash) → main **`1f64c07`** |
| 마이그레이션 | 없음 (스키마 무변경) |
| 스테이징 배포 | **2026-08-26 완료** — 부팅 `successfully started`, `/health` ok, 신규 라우트 무인증 401 |
| 프로덕션 | 미배포 |

## 구현 내용

### ① 대시보드 연동상태 (결함 수정)
- 원인: API는 `{name, status, lastSyncAt, detail}`인데 웹 인터페이스가 `provider`로 작성돼
  **존재하지 않는 필드를 렌더 → 라벨 전부 빈칸**(계약 불일치, 런타임 무에러).
- 수정: 계약 정정 + 항목명(i18n `integration.{name}`, 미지 값 원문) + detail·마지막 동기화 보조 라인.
- **동일 결함이 어드민 개요 페이지에도 있었음** — 계약 정정이 tsc 에러로 드러내 동시 수정.

### ② 만족도(CSAT) 통계 — `/statistics` '만족도' 탭
- 신규 API 3종(ANALYTICS_READ): `GET /agent/csat/summary|agents|conversations` —
  `conversations.csat_rating` 실시간 집계, `ended_at` 축(기록 경로의 statDate와 동일), 기본 최근 30일.
- 상담원 귀속 = `COALESCE(agent_id, 마지막 agent 발화 sender_id)` — `recordCsatForAgent`와 동일 규칙
  (`agent_daily_stats` 평균의 평균은 가중 왜곡이라 미사용). NULL 귀속 = '미배정'(AI 단독 응대).
- 탭 UI: 요약 카드 4종(평균·응답수·응답률(분모=종료 대화)·1~5 분포 바) + 상담원별 표 +
  세션별 목록(평점·상담원 필터, 페이지네이션, 행 클릭=`/live-chat?conversation=` 딥링크).
  기간 필터는 질문 분석 섹션과 공유.

## 파일

백엔드: `agent.service.ts`(csatSummary/csatByAgent/csatConversations + CSAT_AGENT_EXPR), `agent-console.controller.ts`(라우트 3), `agent.request.ts`(CsatQuery), `agent.service.csat.spec.ts`(신규 5).
프런트: `DashboardPage.tsx`·`dashboard.service.ts`(계약 정정), `AdminOverviewPage.tsx`(동일 수정), `StatisticsPage.tsx`(섹션 탭), `CsatSection.tsx`(신규), `statistics.service/hooks.ts`, statistics·dashboard 로케일 6종.

## 테스트 결과

- 유닛: 신규 5케이스 포함 **157 suites / 1,663 tests 통과**. typecheck·build·i18n:check·실부팅 ✅.
- 스테이징 API 스모크 (2026-08-26, ivyusa 7~8월):
  - summary: 종료 52 · 평가 6 · 평균 4.6667 · 분포 {3★:1, 5★:5} — **수기 검산 (3+5×5)/6 일치**.
  - agents: 미배정 3건(avg 5)·Master Owner 2건(avg 4 = 3★+5★)·seshin@ 1건 — 합 6 정합, 귀속 규칙 실증.
  - conversations: 6건 목록(별칭/고객명/상담원/채널/평점/일자), rating=5 필터 → 5건 전건 일치.
  - 무인증 401, `from=26-08-01`·`rating=9` → 400 E5003 (DTO 거부).
- UI 육안(S1·S2 카드 표시, S5 딥링크, S6 빈 상태)은 운영 확인 잔여.

## 잔여

- UI 육안 확인(대시보드 detail 라인·만족도 탭 레이아웃).
- 백로그(REQ §4): CSAT 일별 추이 차트, 위젯 평가 코멘트 입력, integration_status의 tenant_id 축.

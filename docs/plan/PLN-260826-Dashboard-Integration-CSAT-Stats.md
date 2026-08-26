# PLN-260826 대시보드 연동상태 항목명 + 만족도 통계 탭 구현 계획

- 근거: `docs/analysis/REQ-260826-Dashboard-Integration-CSAT-Stats.md`

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | R1은 **웹 전용 수정**(인터페이스를 서버 계약 `name/lastSyncAt/detail`로 정정) | 서버 응답은 정상 — 결함은 웹의 존재하지 않는 `provider` 필드 참조(계약 불일치는 런타임 무에러로 숨음) |
| D2 | 만족도는 **`/statistics` 탭**으로 신설(신규 메뉴 없음) | 메뉴 제공/권한 2계층을 건드리지 않고 기존 ANALYTICS_READ 화면에 병렬 — 적정기술 |
| D3 | 상담원별·요약 집계는 `conversations` **실시간 쿼리**(귀속=`COALESCE(agent_id, 마지막 agent 발화자)`) | 기록 경로(recordCsatForAgent)와 동일 규칙. `agent_daily_stats` 평균의 평균은 가중 왜곡 |
| D4 | 세션별 목록은 평가된 대화만, 별칭/고객명은 기존 listSessions 배치 조회 재사용 | 응답률 분모(종료 수)는 요약에서만. 목록 행 클릭=기존 `/live-chat?conversation=` 딥링크 |
| D5 | 기간 파라미터 `from`/`to`(YYYY-MM-DD, 기본 최근 30일), `ended_at` 기준 | 평가 시점이 아닌 상담 종료일 축 — 상담원 성과 귀속과 일관(기록 경로의 statDate와 동일) |

## W1. 백엔드 (`agent.service.ts` + `agent-console.controller.ts`)

1. `csatSummary(tenantId, from, to)` — 1쿼리: `COUNT(ended)`, `COUNT(csat_rating)`, `AVG`, `SUM(CASE rating=n)` ×5 → `{avg, rated, ended, distribution}`.
2. `csatByAgent(tenantId, from, to)` — GROUP BY 귀속 상담원(위 COALESCE 식), users 조인으로 이름 배치 → `[{agentId, name, rated, avg}]` (rated DESC).
3. `csatConversations(tenantId, {from, to, rating?, agentId?, page, size})` — 평가된 종료 대화 페이지네이션
   (`csat_rated_at DESC`), 별칭·고객명·상담원명 배치 조회 → 행 `{id, sessionId, alias, customerName, agentName, channel, rating, ratedAt, endedAt}`.
4. 라우트 3종 `@Get('csat/summary'|'csat/agents'|'csat/conversations')` — **ANALYTICS_READ**(기존 stats와 동일), Query DTO(`from/to` IsDateString, `rating` IsIn 1..5).
5. 유닛: 기간 경계·rating/agent 필터 where 조립, 귀속 COALESCE 식 포함 여부, 테넌시.

## W2. 프런트

- `DashboardPage`: `IntegrationStatus`를 `{name, status, lastSyncAt, detail}`로 정정, 행=항목명(i18n `integration.{name}` 폴백 원문)+배지, 아래 보조 라인 `detail · 마지막 동기화 시각`(있을 때만).
- `StatisticsPage`: 상단 탭 `질문 분석 | 만족도`(state 전환, 라우트 불변).
- 만족도 탭 컴포넌트 `CsatSection.tsx`(신규): 기간 프리셋(7일/30일/90일)+직접 입력, 요약 카드 4종+분포 바,
  상담원별 테이블, 세션별 목록(평점·상담원 필터, Pagination, 행 클릭 딥링크).
- hooks: `useCsatSummary/useCsatAgents/useCsatConversations`(tenantKey 포함).
- i18n 6언어 ~22키(+dashboard `integration.{name}` 7종).

## W3. TCR · RPT (스키마 무변경 — Migration 없음)

## 와이어프레임

### ① 대시보드 연동상태 카드 (수정)
```
┌ 연동 상태 ────────────────────────┐
│ Shopify              [connected] │
│  └ Synced 0 order(s)… · 8/26 15:10│  ← detail + 마지막 동기화(보조 라인, 있을 때만)
│ Yotpo                [error]     │
│  └ Yotpo returned 404 · 8/25 17:34│
│ Google Drive         [connected] │
└──────────────────────────────────┘
```

### ② /statistics 만족도 탭
```
┌ [질문 분석] [만족도] ──────────────────────────────────────────┐
│ 기간 [7일][30일][90일] [2026-07-27]~[2026-08-26]               │
│ ┌평균 4.2┐ ┌응답 57┐ ┌응답률 18%┐ ┌분포 1★▁ 2★▂ 3★▃ 4★▆ 5★█┐ │
│                                                               │
│ ▸ 상담원별                        ▸ 세션별  평점[전체▾] 상담원[전체▾]│
│ ┌───────────────┬─────┬─────┐   ┌────────┬──────┬────┬───┬────┐│
│ │ 상담원         │평가수│ 평균 │   │ 종료일  │ 세션  │상담원│채널│평점 ││
│ │ 김상담         │  23 │ 4.5 │   │ 8/26   │ 홍길동│김상담│위젯│★4  ││ ← 행 클릭=/live-chat 딥링크
│ │ 이상담         │  12 │ 3.8 │   │ 8/25   │ 4f9a2c│ —  │텔레│★2  ││
│ └───────────────┴─────┴─────┘   └────────┴──────┴────┴───┴────┘│
│                                   ‹ 1 2 ›                      │
└───────────────────────────────────────────────────────────────┘
```

## 부수영향
- 스키마·기존 API 무변경, `/statistics` 라우트/메뉴 무변경(탭만 추가). 대시보드는 표시 필드 수정뿐.
- 집계 쿼리는 `(tenant_id, ended_at)` 범위 스캔 — 대화 수 규모(수천)에서 문제 없음, 인덱스 추가는 관측 후.

## 검증 계획
유닛(기간/필터/귀속/테넌시) + 스테이징: 대시보드 7항목명 표시(yotpo error detail 포함), 만족도 요약 값=DB 대조, 상담원별 귀속(agent_id NULL·발화 귀속 케이스), 평점 필터·딥링크, 평가 0건 기간의 빈 상태.

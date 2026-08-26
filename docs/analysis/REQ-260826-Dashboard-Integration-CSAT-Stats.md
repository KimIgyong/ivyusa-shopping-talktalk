# REQ-260826 대시보드 연동상태 항목명 + 만족도(CSAT) 통계 페이지

- 작성일: 2026-08-26
- 요청 유형: [요구사항] 2건 — ① `/dashboard` 연동상태에 항목명 미표시 ② 만족도 확인 메뉴/페이지 부재(세션별·상담원별 통계)

## 1. AS-IS

### R1. 대시보드 연동상태 — **필드명 불일치 결함**
- API `GET /integrations/status`는 `{name, status, lastSyncAt, detail}` 반환(스테이징 실측: shopify/fulfillment/klaviyo/odoo/google_drive/haravan/yotpo 7행).
- 웹 `DashboardPage`는 **`it.provider`를 렌더** — 존재하지 않는 필드라 라벨이 전부 빈칸, 상태 배지만 7개 나열.
  React key도 `it.provider`(전부 undefined)로 중복 경고 소지. `detail`("Yotpo returned 404")·`lastSyncAt`도 미표시.
- 원인: 웹 인터페이스 `IntegrationStatus.provider`가 서버 계약(`name`)과 어긋난 채 작성됨(계약 불일치, 런타임 무에러).

### R2. 만족도(CSAT)
- **수집은 완비**(PLN-260810 P2): 위젯 종료 시 1~5점 → `conversations.csat_rating/csat_rated_at`(24h 창, 재평가 덮어씀),
  상담원 귀속 일평균 → `agent_daily_stats.csat_avg`(귀속=마지막 상담원 발화자 ?? conversation.agent_id).
- **조회는 전무**: `GET /agent/stats`(일별 csat_avg 포함, ANALYTICS_READ)가 있으나 **콘솔 어느 페이지도 호출하지 않음**.
  `/statistics`는 질문 분석 전용. 세션별 평점 목록은 API 자체가 없음.

## 2. TO-BE

### R1. 연동상태 카드 수정 (웹 전용)
- 인터페이스를 서버 계약으로 정정(`name/lastSyncAt/detail`), 행에 **항목명 라벨**(i18n `integration.{name}`, 미지 값은 원문) +
  상태 배지 + `detail`·마지막 동기화 시각을 보조 라인/툴팁으로 표시.

### R2. `/statistics`에 "만족도" 탭 신설 (기존 메뉴 재사용 — 신규 메뉴 등록 불필요)
- 기존 질문 분석과 탭으로 병렬(`질문 분석 | 만족도`). 기간 필터(기본 최근 30일).
- **요약 카드**: 평균 평점 · 응답 수 · 응답률(평가/종료 대화) · 1~5점 분포 바.
- **상담원별 통계 테이블**: 상담원명 · 평가 수 · 평균 평점 — `conversations`에서 실시간 집계
  (귀속 = `COALESCE(agent_id, 마지막 agent 발화 sender_id)` — 기록 경로와 동일 규칙.
  ⚠️ `agent_daily_stats.csat_avg`의 "평균의 평균"은 가중치가 틀어져 부적합).
- **세션별 목록**(페이지네이션): 종료일 · 세션(별칭/고객명) · 상담원 · 채널 · 평점 · 평가시각,
  필터=평점(1~5/전체)·상담원, 행 클릭 → `/live-chat?conversation={id}` 딥링크(기존 경로).
- 신규 API(ANALYTICS_READ, 기존 stats와 동일 권한):
  - `GET /agent/csat/summary?from&to` — 평균/응답수/종료수/분포
  - `GET /agent/csat/agents?from&to` — 상담원별 집계
  - `GET /agent/csat/conversations?from&to&rating&agent_id&page&size` — 세션별 목록

## 3. 사용자 플로우
1. 대시보드에서 yotpo가 `error — Yotpo returned 404`임을 항목명과 함께 즉시 인지.
2. /statistics → 만족도 탭 → 이번 달 평균 4.2·응답률 18% 확인 → 1점 필터 → 해당 대화 딥링크로 원문 검토.
3. 상담원별 표에서 평가 수 대비 평균이 낮은 상담원을 코칭 대상으로 식별.

## 4. 제약·전제
- 스키마 변경 없음(기존 컬럼 집계·조회만). 마이그레이션 불필요.
- 평가 없는 종료 대화는 목록 제외(응답률 분모에만 사용). 평점은 개인정보 아님(기존 결정) — 소비자 식별은 기존 별칭/고객명 표시 규칙 준용.
- i18n 6언어, 테넌트 술어 전 경로, 유닛(집계 쿼리·귀속 규칙) 추가.
- 범위 밖(백로그): CSAT 추이 차트(일별), 코멘트 수집(위젯에 입력란 없음), 대시보드 연동상태 tenant_id 축(전역 테이블 레거시 갭).

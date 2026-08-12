# PLN-260809-Issue-Workflow-Backlog

이슈 워크플로우 **백로그 4건**(L3 릴레이 · SLA 설정화 · 보드 터치 대응 · 자동해소 tier) 작업계획서.

- 작성일: 2026-08-09 · 근거: RPT-260809-Issue-Workflow-P5 §4 백로그, REQ-260807 §11.2.2(L3)·§5.2(tier)
- ⚠️ **사용자 승인 후 구현 착수**

---

## B1. Gorgias L3 — 상담원 답변 위젯 릴레이 (bridge)
- **웹훅 확장**: `POST /webhooks/gorgias`가 `message` 필드를 함께 수신
  (`{ticket:{id,status}, message:{id, from_agent, body_text}}` — Gorgias HTTP Integration에
  ticket-message-created 트리거 추가, 가이드 갱신).
- `from_agent=true`인 메시지만: external_tickets 매칭 → **모더레이션(scope agent, FR-069) 통과 후**
  대화에 agent 메시지로 persist → 고객 알림("상담원 답변 도착", 기존 버스) → 위젯 폴링으로 채팅에 표시.
- 멱등: `external_tickets.last_inbound_message_id` 컬럼 추가(SQL) — 이미 릴레이한 Gorgias 메시지 id 이하 무시.
- 이메일 회귀와 병행돼도 무해(같은 답변이 이메일+위젯 양쪽 — Gorgias 특성, 가이드에 명기).

## B2. SLA 목표시간 콘솔 설정화 (결정 5 확장)
- `handoffConfig.sla?: { normalHours?: number; urgentHours?: number }` (JSON 확장 — 스키마 무변경, 기본 24/4 유지).
- 보드 API가 테넌트 설정을 읽어 slaState 계산에 사용(mapper에 limits 인자화).
- 콘솔 /settings 핸드오프 섹션에 숫자 입력 2개(일반/긴급 목표시간, 1~168h 검증).

## B3. 보드 터치 대응 — "이동" 셀렉트 (적정기술)
- HTML5 DnD는 터치 미지원 → 라이브러리 추가 없이 **카드에 "이동 ▾" 셀렉트**(허용 전이만 옵션으로)
  를 병설 — 데스크톱은 드래그+셀렉트 겸용, 모바일은 셀렉트로 완전 대응. 반려 선택 시 기존 사유 모달.

## B4. 자동해소 tier 스탬프 (접수→해결 단축경로, REQ §5.2)
- **고객이 상담 종료**(위젯 버튼) 시 이슈가 `received`+**미배정**이면: 마지막 봇 답변을 판별해
  - AI 답변(confidence ≥ 에스컬 임계) → `resolved(tier=ai)` → `closed`
  - 시나리오 응답(trace.scenario) → `resolved(tier=scenario)` → `closed`
  - 그 외(답변 없음/저신뢰) → 현행 유지(open 존치 — 워크리스트 보전)
- 상담원이 개입한(`in_progress`) 이슈는 현행 유지. 타임라인에 tier_advanced/자동해결 이벤트 기록,
  고객에겐 별도 알림 없음(본인이 종료한 맥락). 통계의 tier별 해소율이 이때부터 유의미해짐.

## 사이드 임팩트
| 영역 | 영향 | 판단 |
|---|---|---|
| L3 릴레이 | 모더레이션 게이트 통과 후만 persist — FR-069 유지; 웹훅 토큰 인증 기존 그대로 | 준수 |
| SLA | 미설정 테넌트 기본값 동일 — 표시만 영향 | 안전 |
| 이동 셀렉트 | 드래그와 동일 API — 신규 경로 없음 | 안전 |
| B4 | received+미배정+고신뢰 조건에서만 단축 — 상담원 워크리스트 침해 없음 | 안전 |

## 테스트/배포
- 단위: L3(멱등 커서·from_agent 필터·모더레이션 차단 시 미릴레이), SLA limits 인자, B4 판별 3분기.
- SQL 1건(`260809-issue-backlog.sql`: last_inbound_message_id) 선적용 → 배포.
- PR-B1(백엔드: L3+B4+SLA API) → PR-B2(콘솔·가이드: SLA 입력+이동 셀렉트+가이드 갱신).

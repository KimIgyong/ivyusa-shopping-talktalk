# RPT-260810-Issue-Workflow-Backlog

이슈 워크플로우 **백로그 4건** 구현 결과 — 애드온 기능 세트 완성.

- 근거: PLN-260809-Issue-Workflow-Backlog (2026-08-10 승인) · 테스트: TCR-260810-Issue-Workflow-Backlog
- PR #211(PLN) #212(백엔드) #213(콘솔) — CI pass·squash-merge, staging 2026-08-10 배포·검증(SQL 선적용)

## 1. 무엇이 생겼나
| # | 항목 | 구현 |
|---|---|---|
| B1 | **Gorgias L3 답변 릴레이** | 웹훅이 ticket-message-created를 수신, from_agent 답변을 **모더레이션(FR-069) 통과 후** 위젯 채팅에 상담원 턴으로 persist + "답변 도착" 알림. `last_inbound_message_id` 커서로 멱등, message-only 이벤트는 상태 미변경. 가이드 §3b(두 번째 HTTP Integration+이메일 이중전달 유의) |
| B2 | **SLA 목표 설정화** | `handoffConfig.sla`(일반/긴급 시간, 1~168 clamp, 기본 24/4) — /settings 입력 2개, 보드 배지가 테넌트 목표 기준으로 계산 |
| B3 | **보드 터치 대응** | 카드 "이동…" 셀렉트(서버 상태머신 미러, 반려=기존 사유 모달) — 라이브러리 무추가로 모바일 완전 대응 |
| B4 | **자동해소 tier**(REQ §5.2 단축경로) | 고객이 상담 종료 시 접수+미배정 이슈를 마지막 봇 턴으로 판별: AI 고신뢰→resolved(tier=ai), 시나리오→tier=scenario, 조용히 종결. 저신뢰·무답변·상담원 개입 건은 현행 유지. **1·2·3차 해소율 통계가 이제 유의미** |

## 2. 남은 일
- 사용자 스모크 E1~E3(TCR §3) + Gorgias 실 계정 시 E4.
- **이슈 워크플로우 트랙의 계획된 개발 항목은 이것으로 소진** — 이후는 운영 피드백 기반(예: 파일럿 운영 후 SLA/deny 룰 튜닝, IVY USA bridge 전환).

## 3. 예방 패턴
- 상태 미러 웹훅에 이벤트 종류가 늘면 **필드 부재=변경 아님** 원칙(빈 status가 closed를 open으로 뒤집던 잠재 결함을 설계 단계에서 차단).
- 외부발 메시지를 내부 채널로 릴레이할 땐 항상 ①모더레이션 게이트 ②멱등 커서 ③방향 필터 3종 세트.

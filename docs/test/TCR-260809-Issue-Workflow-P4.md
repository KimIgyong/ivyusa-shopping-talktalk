# TCR-260809-Issue-Workflow-P4

PLN-260809-Issue-Workflow-P4 — PR #205(백엔드+콘솔) 테스트 케이스·결과.

## 1. 단위/통합 (805/805 PASS — 기존 스위트 회귀 없음)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | board: open 전체 + settled 최근 20, 담당자 이름 일괄 해석 | ✅(로직) |
| U2 | slaState 계산: urgent 4h/normal 24h, 70% 경과 warning, 초과 overdue, 종결 상태 null | ✅(로직) |
| U3 | stats: 상태별 counts·미배정·라벨 분포·30일 평균해결·재오픈율·workflowMode | ✅(로직) |
| U4 | priority: 담당자/manager 허용·그 외 403·감사 기록 | ✅(로직) |
| I1 | typecheck·build 그린, 라우트 board/stats가 :id 라우트보다 선순위 매핑 | ✅ |

## 2. 스테이징 (2026-08-09 배포, SQL 없음)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | 부트 정상, `GET /agent/issues/board`·`/stats` → 401(배포·인증 요구) | ✅ |

## 3. 수동 E2E (사용자 스모크 — 잔여)
| # | 시나리오 | 기대 |
|---|---|---|
| E1 | 콘솔 사이드바 "이슈 보드" → /issues (amoebaorder) | KPI 바 + 5컬럼 보드, 기존 이슈 카드 표시 |
| E2 | 카드를 진행→해결 드래그 | 전이 + 고객 알림(P3) + 보드 갱신 |
| E3 | 반려 컬럼 드롭 | 사유 모달 → 확정 시 반려(사유별 고객 알림) |
| E4 | staff 계정으로 남의 카드 드래그 | 403 토스트 + 원위치 |
| E5 | 카드 우선순위 토글 → urgent | 카드 뱃지 변경, 4h 기준 SLA ⚠/🔥 |
| E6 | 카드 클릭 | /live-chat?conversation= 딥링크로 해당 스레드 열림 |
| E7 | ivyusa(base) 콘솔에서 /issues | 애드온 미사용 안내 문구 |

## 4. 메모
- SLA는 계산형(스키마 무변경) — 목표시간 조정은 코드 상수(urgent 4h/normal 24h), 콘솔 설정화는 후속.
- 드래그는 HTML5 네이티브 — 모바일 터치 드래그는 미지원(카드 클릭→라이브챗 IssuePanel 버튼으로 대체 가능).

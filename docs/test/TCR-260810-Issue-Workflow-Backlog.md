# TCR-260810-Issue-Workflow-Backlog

PLN-260809-Issue-Workflow-Backlog — PR #212(백엔드)/#213(콘솔) 테스트 케이스·결과.

## 1. 단위 (jest — 818/818 PASS, 백로그 신규 6케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | L3: from_agent 답변 → 모더레이션 통과 후 agent 턴 persist + 고객 알림 + 커서 전진, **message-only 이벤트는 status 불변** | ✅ |
| U2 | L3: 커서 이하 중복·비상담원(from_agent=false) 메시지 스킵 | ✅ |
| U3 | L3: 모더레이션 BLOCKED 답변 미릴레이 | ✅ |
| U4 | B4: 고객 종료+접수+미배정+AI 고신뢰 → resolved(tier=ai)→closed, **무알림** | ✅ |
| U5 | B4: 시나리오 응답 → tier=scenario | ✅ |
| U6 | B4: 저신뢰/상담원측 종료/배정된 이슈 → 현행 유지(open) | ✅ |
| — | B2: SLA limits 인자화(설정 clamp 1~168, 기본 24/4) — 로직 검증 | ✅ |

## 2. 스테이징 (2026-08-10 배포)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | SQL 선적용(last_inbound_message_id) → 배포, 부트 정상·스키마 에러 0 | ✅ |
| S2 | 웹훅 message 페이로드 + bad token → 401 | ✅ |

## 3. 수동 E2E — 실행 결과 (2026-08-10)
| # | 시나리오 | 결과 |
|---|---|---|
| E3 | 고신뢰 AI 답변→상담원 연결(이슈 #5 received)→**고객 상담 종료** | ✅ **서버측 실행 통과** — 즉시 resolved(**tier=ai**)→closed, 타임라인 created→auto-resolved(ai)→customer ended, 알림은 접수 1건뿐(자동 종결 무알림). 참고: 저신뢰 즉시이관 대화(#4)는 AI 답변이 없어 자동해소 미적용(설계 의도) |
| E1 | SLA 목표 반영 | **준비됨** — tenant 3에 2h/1h 설정(deny 규칙 보존 확인). 콘솔 확인: /issues 보드에서 #1~#4 전부 🔥, /settings 핸드오프에 2/1 로드 → 원하는 운영값으로 저장(저장 자체가 E1 본검증) |
| E2 | 보드 "이동…" 셀렉트(터치) | 콘솔 확인 잔여 |
| E4 | Gorgias L3 실계정 릴레이 | Gorgias 계정 확보 시 |

## 4. 메모
- L3는 Gorgias 이메일 발송과 병행(같은 답변 이중 전달) — 가이드 §3b에 명기.
- B4 판별 임계 0.45(에스컬 임계와 동일) — 조정 필요 시 코드 상수.

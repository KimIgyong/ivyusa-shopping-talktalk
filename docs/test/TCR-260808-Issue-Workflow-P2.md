# TCR-260808-Issue-Workflow-P2

PLN-260808-Issue-Workflow-P2 — PR #197(백엔드+SQL)/#198(콘솔) 테스트 케이스·결과.

## 1. 단위 (jest — 800/800 PASS, P2 신규 10케이스)
| # | 케이스 | 결과 |
|---|---|---|
| U1 | denyMatch: 대소문자 무시 키워드 매칭 → rule의 type/label 반환 | ✅ |
| U2 | denyMatch: 규칙 없음/미매칭/빈 키워드 → null | ✅ |
| U3 | 이슈 승격 시 deny 스탬프 우선, 없으면 기본 type→label 맵(배송→operations 등) | ✅ |
| U4 | 이관(assign): manager가 이관 시 기존 배정 transferred→신규 active, 대화 repoint, 이슈 재스탬프 | ✅ |
| U5 | 이관: staff 금지(403) | ✅ |
| U6 | Gorgias 생성: 대화록 순서·from_agent 방향 보존, customer.email dedup 축, ref+커서 저장 | ✅ |
| U7 | Gorgias 게이팅: native 테넌트/자격증명 없음/이메일 없음 → fetch 없이 스킵 | ✅ |
| U8 | 재-에스컬레이션: 커서 이후 고객 메시지만 append + 커서 전진 | ✅ |
| U9 | 기존 채팅 스펙: denyMatch 목 추가로 전체 회귀 없음 | ✅ |
| U10 | (accept 캡) 프로필 없는 상담원은 현행 무제한 유지 — 코드 경로 검증 | ✅(로직) |

## 2. 로컬 통합
| # | 케이스 | 결과 |
|---|---|---|
| I1 | `sql/260808-issue-p2.sql` dev 적용(external_tickets) + 실부트 successfully started | ✅ |

## 3. 스테이징 (2026-08-09 배포)
| # | 케이스 | 결과 |
|---|---|---|
| S1 | SQL 선적용(external_tickets 확인) → 배포, 부트 정상·스키마 에러 0 | ✅ |
| S2 | `POST /agent/issues/:id/assign` → 401(배포·인증 요구) | ✅ |

## 4. 수동 E2E (사용자 스모크 — 잔여)
| # | 시나리오 | 기대 |
|---|---|---|
| E1 | /settings 핸드오프에 deny 규칙(예: "환불"→환불/회계) 저장 → amoebaorder 위젯에서 "환불해주세요" | AI 응답 없이 즉시 핸드오프 안내, 콘솔 이슈 뱃지 유형=환불·라벨=회계 |
| E2 | 회계 라벨 상담원 online 상태에서 E1 재현 | 알림이 해당 상담원 타겟(다른 상담원 목록엔 broadcast 아님) |
| E3 | 상담원 maxConcurrent=1 설정 후 2번째 수락 | 409 + 콘솔 오류 토스트 |
| E4 | manager로 이슈 이관 드롭다운 → 다른 상담원 | 담당 변경 + 타임라인 배정 이벤트; staff는 403 |
| E5 | (Gorgias 실 계정 확보 시) 테넌트 bridge 전환 + 자격증명 저장 → 에스컬레이션 | Gorgias에 티켓 생성(대화록 포함); 재에스컬 시 동일 티켓에 append |

## 5. 메모
- E5는 실 Gorgias 계정/키 필요 — IVY USA bridge 전환은 사용자 확인 후(PLN §S4 가드).
- L2(상태 회신 웹훅)·SLA·칸반은 P3/P4.

# RPT-260808-Issue-Workflow-P2

이슈 워크플로우 **P2 — 정책 deny-list · 라벨 자동배정 · maxConcurrent · Gorgias L1 커넥터** 구현 결과.

- 근거: PLN-260808-Issue-Workflow-P2 (2026-08-08 승인) · 테스트: TCR-260808-Issue-Workflow-P2
- 결정 반영: 4(라벨 축)·10(권한)·11(L1→L2)·12(append/신규)·13(Gorgias 우선)

## 1. 무엇이 생겼나

### PR #197 — 백엔드+SQL (P2a)
- **정책 deny-list**: `handoffConfig.denyRules`(키워드+type/label). 매칭 시 **LLM을 묻지 않고**
  reason 'policy'로 강제 핸드오프, 승격되는 이슈에 type/label 스탬프. 답변재사용 조회보다 먼저 평가.
- **라벨 자동배정**: 이슈 `assignee_label` = deny rule ?? 기본 맵(취소·환불→accounting, 배송·제휴→operations,
  나머지→consult). 에스컬레이션 알림은 해당 라벨 보유·online·여유(활성<maxConcurrent) 상담원 중
  **최소 부하 1인**에게 타겟 — 대상 없으면 기존 broadcast 폴백(알림 유실 없음).
- **maxConcurrent 강제**: `accept()`에서 활성 배정 ≥ 프로필 캡이면 409(E5022)+warn. 프로필 없으면 현행 무제한.
- **이관/재배정**: `POST /agent/issues/:id/assign`(manager+) — 기존 배정 `transferred`, 신규 active,
  대화 repoint, 이슈 재스탬프, 타임라인+감사.
- **Gorgias L1**(bridge 테넌트): ESCALATION 구독 → #191의 자격증명으로 `POST /api/tickets`
  (전체 대화록 순서·방향·원 타임스탬프 보존 + 최근 주문 노트 + 태그). 재-에스컬레이션은
  `external_tickets` 커서 이후 고객 메시지를 동일 티켓에 append(결정 12의 closed 분기는 L2 웹훅에서).
  이메일 없음/자격증명 없음/비-bridge → 스킵+warn, 1회 재시도, 비치명.
  **모드 배타성**: native는 여기서 no-op, bridge는 IssueService에서 no-op — 구조적으로 보장.
- `sql/260808-issue-p2.sql`: external_tickets(추가 전용).

### PR #198 — 콘솔 (P2b)
- /settings 핸드오프 섹션에 **deny-list 편집기**(키워드 쉼표 입력+유형+라벨 행, 추가/삭제, 저장 토스트).
- IssuePanel에 **이관 드롭다운**(상담원 목록; 서버가 manager 강제 — staff는 403 토스트).

## 2. 배포 상태
| 항목 | 상태 |
|---|---|
| PR | #196(PLN) #197(P2a) #198(P2b) — CI pass·squash-merge |
| 마이그레이션 | `sql/260808-issue-p2.sql` staging **선적용** 후 배포 |
| staging | 2026-08-09 — 부트 정상·스키마 에러 0·assign 라우트 401 확인 |
| Gorgias | 커넥터 코드 배포됨 — **실 계정 자격증명 등록 + 테넌트 bridge 전환은 사용자 확인 후**(그 전까지 무동작) |

## 3. 남은 일 (로드맵)
- 사용자 스모크 E1~E4(TCR §4) — deny 규칙→강제 티켓·라벨 타겟 알림·409·이관
- E5: Gorgias 실 계정 연동 검증 → IVY USA bridge 전환 결정
- **P3**: 고객 상태회신(전이별 안내 + 위젯 Inquiries 탭 전환, Gorgias L2 웹훅 합류)
- **P4**: 칸반 보드·워크플로우 대시보드 / **P5**: 지식 폐루프

## 4. 예방 패턴
- 정전/네트워크 단절로 `gh pr merge`가 끊겨도 **푸시된 브랜치+열린 PR이 안전망** — 재개는 merge 재시도 한 번.
  단절 중 `git checkout main`이 섞이면 워킹트리가 이전 상태로 보이므로 **브랜치 확인부터**.
- 다중 소비자 버스 이벤트에 필드를 추가할 땐 소비자별 옵셔널로 — AgentAlert/Issue/ExternalTicket 3구독자가
  같은 ESCALATION 페이로드를 각자 필요한 만큼만 읽는다.

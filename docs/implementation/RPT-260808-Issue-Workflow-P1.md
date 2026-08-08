# RPT-260808-Issue-Workflow-P1

라이브챗 이슈 워크플로우 **P1(이슈 코어)** 구현 결과 — 티켓·상태머신·엔타이틀먼트·콘솔 최소 UI.

- 근거: REQ-260807-LiveChat-Issue-Workflow(§10b 결정 14건 확정) + PLN-260808-Issue-Workflow-P1 (2026-08-08 승인)
- 테스트: TCR-260808-Issue-Workflow-P1

## 1. 무엇이 생겼나

### PR #192 — 백엔드+SQL (P1a)
- **스키마**(`sql/260808-issues-p1.sql`): `issues`(테넌트별 issue_no max+1, conversation 1:1 unique,
  type/status/priority/반려사유/reopen_count) + `issue_events`(append-only 타임라인) +
  `tenants.workflow_mode`(**native/bridge/base** 3-모드 엔타이틀먼트, 기본 base=기존 동작 불변)
- **승격**: ESCALATION 버스 이벤트 구독 **단일 훅** — 저신뢰/모더차단/고객요청 3경로 모두 커버,
  preview 세션은 이벤트 미발행이라 자연 제외. settled 이슈 재-에스컬레이션은 재오픈(reopen_count++).
  intent→type 매핑(order/delivery/cancel/refund/partnership/other). at-least-once 버스는 uk_issue_conv로 멱등.
- **상태머신**: 접수→진행→해결|반려→종료 + 재오픈. 반려=사유 코드 필수(정책불가/오분류/스팸)+manager 이상,
  일반 전이=담당자 또는 manager 이상(결정 3·10). 전이는 이벤트+감사 기록.
- **훅**: 상담원 수락→배정+진행+3차 티어 스탬프 / 대화 종료(콘솔·고객 종료 버튼)→settled 이슈 자동 종료.
  전부 best-effort(`?.`가드+말미 옵셔널 주입) — 상담 흐름을 절대 깨지 않고 기존 스펙 목 무수정 통과.
- **API**: `GET /agent/issues/by-conversation/:id` · `POST /agent/issues/:id/transition` ·
  `GET /agent/issues/:id/events` (CONVERSATION_HANDLE). 목록/칸반 API는 P4.
- 에러코드 E5020/E5021 신설.

### PR #193 — 콘솔 최소 UI (P1b)
라이브챗 스레드 헤더 아래 `IssuePanel`: `#번호`+상태/유형 뱃지, 해결/반려(사유+메모)/재오픈 버튼(토스트),
접이식 타임라인. **self-gating** — 이슈 null이면 미렌더(base/bridge 테넌트 화면 불변). i18n en/es/ko. 칸반은 P4.

## 2. 배포 상태
| 항목 | 상태 |
|---|---|
| PR | #192, #193 — CI pass·squash-merge |
| 마이그레이션 | `sql/260808-issues-p1.sql` staging **선적용** 후 배포 |
| staging | 2026-08-08 18:36 — 부트 정상, 스키마 에러 0, 라우트 401 확인 |
| 파일럿 | tenant 3(amoebaorder) `workflow_mode='native'` 지정(결정 14) — ivyusa/annehearts는 base |

## 3. 남은 일 (로드맵)
- 사용자 스모크 E1~E6(TCR §4) — amoebaorder 실몰 에스컬레이션→이슈 E2E
- **P2**: 정책 deny-list·라벨 자동배정·**Gorgias L1 커넥터**(자격증명은 #191로 선반영 완료) — IVY USA는 이때 'bridge' 전환
- **P3**: 고객 상태회신(위젯 Inquiries 전환+push) / **P4**: 칸반 보드·워크플로우 대시보드 / **P5**: 지식 폐루프

## 4. 예방 패턴
- **버스 이벤트 구독이 다중 트리거 훅의 최소 침습 지점** — chat.service 3곳 수정 대신 구독 1개로 커버,
  preview 제외까지 공짜. 단 at-least-once이므로 소비자 측 멱등 키(unique) 필수.
- 파일럿 게이팅은 **서버 판정 컬럼 + null-렌더 UI** 조합이 가장 저렴 — 클라 피처플래그 불필요.

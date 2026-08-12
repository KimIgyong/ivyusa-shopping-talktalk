# RPT-260809-Issue-Workflow-P3

이슈 워크플로우 **P3 — 고객 상태회신 + 위젯 문의 피드 + Gorgias L2 상태 웹훅** 구현 결과.

- 근거: PLN-260809-Issue-Workflow-P3 (2026-08-09 승인) · 테스트: TCR-260809-Issue-Workflow-P3

## 1. 무엇이 생겼나

### PR #201 — 백엔드 (P3a)
- **상태회신(native)**: 이슈 생성·모든 전이에서 세션 언어(EN/ES/KO) 알림을 기존 알림 버스로 발행 —
  인앱+웹푸시(고객 채널 선호 반영, 결정 6). 반려는 사유별 문구(결정 3), 해결은 처리 메모 동봉,
  `replyChannel=email` 스레드의 해결/반려는 기존 메일러로도 발송. 전부 best-effort.
- **`GET /issues`**(@Public 세션토큰): 위젯 문의 피드용 세션 스코프 이슈 목록(게스트 포함, 상태 전용 축소 형).
- **Gorgias L2**: `external_tickets.status`(SQL) + gorgias `webhook_secret` 필드 +
  `POST /webhooks/gorgias`(x-shoptalk-token/쿼리 토큰, 미지 토큰 401) → open/closed 미러링,
  **closed 시 고객 "처리 완료" 알림 1회**. closed 후 재-에스컬레이션은 동일 대화 ref로 **신규 티켓 생성**
  — **결정 12(append/신규) 완성**. 설정 가이드 `docs/guide/GORGIAS-CONNECTOR.md`.

### PR #202 — 위젯 (P3b)
- 주문 탭 '문의' 서브탭: 세션에 이슈가 있으면 **이슈 피드**(#번호·유형·상태 뱃지·상태별 안내문·시각, 15s 갱신),
  없으면 기존 주문 필터 유지(비-native 테넌트·일반 고객 화면 불변). 상태 변화 알림은 기존 알림 탭+웹푸시가 담당.

## 2. 배포 상태
| 항목 | 상태 |
|---|---|
| PR | #200(PLN) #201(P3a) #202(P3b) — CI pass·squash-merge |
| 마이그레이션 | `sql/260809-issue-p3.sql` staging 선적용 후 배포 |
| staging | 2026-08-09 18:07 — 부트 정상·스키마 에러 0·`GET /issues` live·웹훅 bad token 401 |

## 3. 남은 일
- 사용자 스모크 E1~E5(TCR §4) + Gorgias 실 계정 시 E6.
- **P4**: 칸반 보드 + 워크플로우 대시보드(이슈 목록 API·드래그 전이·SLA/미배정 뷰) — 다음 착수 대상.
- P5: 지식 폐루프.

## 4. 예방 패턴
- **React 훅은 조기 return 위에** — 서브탭 조건부 useQuery를 하단에 두면 인증 전환 시 훅 순서 위반.
  enabled 플래그로 조건을 옮기고 선언은 항상 상단에.
- 위젯 i18n 중첩 위치와 t() 키 경로는 같은 커밋에서 grep으로 교차 확인(orders.issues.* 사례).

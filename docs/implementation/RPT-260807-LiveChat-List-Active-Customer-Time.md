# RPT — /live-chat 목록 개선 (2026-08-07)

> REQ `docs/analysis/REQ-260807-LiveChat-List-Active-Customer-Time.md` ·
> PLN `docs/plan/PLN-260807-LiveChat-List-Active-Customer-Time.md` (승인 2026-08-07) ·
> TCR `docs/test/TCR-260807-LiveChat-List-Active-Customer-Time.md`

## 1. 무엇이 바뀌었나

1. **진행중 대화 노출** — `GET /agent/sessions?status=all|queue|ended`, 기본 `all`이 `ai_active`를 포함.
   목록이 "상담 대기열"에서 "대화 목록"이 됐다.
2. **마지막 활동 정렬** — 상관 서브쿼리 `MAX(messages.id)` 기준 내림차순(보조: 대화 id).
   오래 전에 열렸어도 지금 대화 중인 스레드가 위로 온다. 기본 페이지 크기 20 → 50.
3. **고객 식별** — 매핑된 고객명 → 없으면 이메일 → 없으면 `Session xxxxxx`.
   이름/이메일이 있을 때도 세션 라벨을 보조 줄로 유지(상담사가 스레드를 지칭하는 단위).
4. **대화창 시각** — 메시지마다 `HH:mm`, 날짜가 바뀌는 지점에 날짜 구분선.

## 2. 변경 파일

`apps/api/src/domain/agent/{agent.service.ts, agent.mapper.ts, agent-console.controller.ts, dto/request/agent.request.ts, agent.service.listsessions.spec.ts}`,
`apps/api/src/domain/customer/customer.service.ts`(`contactsByIds`),
`apps/web/src/domain/live-chat/{LiveChatPage.tsx, live-chat.hooks.ts, live-chat.service.ts}`,
`apps/web/src/i18n/locales/{en,es,ko}/livechat.json`. **스키마 변경 없음.**

## 3. 테스트 결과

- 신규 7케이스 포함 apps/api **53 suites / 553 tests PASS**, typecheck·build 통과, API 실부팅 확인.

## 4. 배포 상태

| 항목 | 값 |
|---|---|
| PR | #125 `2e8de4c` |
| 마이그레이션 | 해당 없음 |
| 스테이징 배포 | **완료** (2026-08-06 18:43, 부팅·health OK) |
| 특이사항 | **CI 미실행 상태로 머지** — 아래 §5 참조 |

### 4-1. CI 우회 경위 (기록 필요)

GitHub Actions 장애(호스티드 러너 미배정, `The job was not acquired by Runner of type hosted`)로 CI가
1시간 넘게 큐에 머물러 머지가 불가능했다. 동일 커밋에 대해 **로컬에서 typecheck·build·553 tests·
API 실부팅을 모두 통과**한 것을 근거로, 저장소 소유자가 `enforce_admins`를 일시 해제 → 관리자 머지 →
**즉시 원복**(`enforce_admins: true` 확인)했다. 보호 설정 변경은 소유자가 직접 수행.

## 5. 스테이징 검증 (2026-08-06)

배포된 엔드포인트: `/agent/sessions`, `?status=queue`, `?status=ended` 모두 **401**(=라우트 배포됨, 인증 필요).

새 정렬·식별 로직과 동일한 조건으로 조회한 실제 데이터:

| 순위 | 대화 | 상태 | last_msg | 이름 | 이메일 | 목록 표기 |
|---|---|---|---|---|---|---|
| 1 | **94** | `ai_active` | 486 | O | O | 고객명 + `Session 94` |
| 2 | 93 | `waiting` | 472 | X | O | **이메일** + `Session 93` |
| 3 | 92 | `waiting` | 456 | X | O | 이메일 + 라벨 |
| 4~ | 91/90/89 | waiting·ai_active | 452/450/448 | X | X | `Session ...` |

→ 종전 목록에서 **아예 빠져 있던 진행중 대화 94번이 최상단**에 오고, 이름 없는 고객은 이메일로 식별된다.

**잔여(화면 실조작)**: 필터 칩 전환, 대화창 시각·날짜 구분선 렌더는 브라우저 확인 필요 — 사용자 확인 대기.

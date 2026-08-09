# PLN-260809-Issue-Workflow-P4

이슈 워크플로우 **P4 — 칸반 보드 + 워크플로우 대시보드** 작업계획서.

- 작성일: 2026-08-09 · 근거: REQ-260807 §5.5 + 결정 5(우선순위 2단계)·10(권한), P1~P3 배포 완료
- **스키마 변경 없음**(SLA는 priority×경과시간 계산형 — 컬럼 추가 없이) · ⚠️ **사용자 승인 후 구현 착수**

---

## 1. 단계별 계획

### S1. 백엔드 — 보드/통계 API (PR-P4a)
- `GET /agent/issues/board` (CONVERSATION_HANDLE): 상태별 그룹
  `{ received[], in_progress[], resolved[], rejected[], closed[] }` — open 상태는 전체,
  resolved/rejected/closed는 최근 20건. 카드 필드: issueNo/type/label/priority/assignee(이름)/
  reopenCount/createdAt/updatedAt/conversationId + **slaState**(계산형: normal 24h·urgent 4h 초과 시 'overdue',
  70% 경과 시 'warning' — open 상태만).
- `GET /agent/issues/stats`: `{ workflowMode, counts{상태별}, unassigned, byLabel{}, avgResolutionHours(최근 30일), reopenRate }`
  — 비-native 테넌트는 `workflowMode`만 의미(콘솔 안내용).
- `PATCH /agent/issues/:id/priority` `{priority: normal|urgent}` (담당자 또는 manager+, 감사) — 카드에서 토글.
- 전이·이관은 기존 P1/P2 API 재사용(신규 없음).

### S2. 콘솔 — /issues 칸반 페이지 (PR-P4b)
- 사이드바에 "이슈 보드" 메뉴 추가. 비-native 테넌트가 열면 안내 문구(애드온 미사용) — stats.workflowMode로 판정.
- **HTML5 drag&drop**(라이브러리 무추가, 적정기술): 카드를 다른 상태 컬럼에 드롭 → 기존 transition API 호출.
  반려 컬럼 드롭 시 사유 모달(3코드+메모), 불허 전이/권한 403은 오류 토스트+원위치. 15s 자동 새로고침.
- 카드 클릭 → 라이브챗 콘솔의 해당 대화로 이동(기존 3열 재사용, `/live-chat?conversation={id}` 딥링크 —
  LiveChatPage가 쿼리로 초기 선택 지원(소규모 추가)).

```
┌ 이슈 보드 ────────────────────────────────────────────────────────────┐
│ KPI: 접수 3 · 진행 5 · 미배정 2 · 평균해결 6.2h · 재오픈율 8%           │
│┌─접수(3)──┐┌─진행(5)──┐┌─해결(2)─┐┌─반려(1)─┐┌─종료(20)─┐             │
││#41 환불   ││#39 배송   ││#38 …    ││#36 …    ││ …        │             │
││회계·⚠2h   ││운영·김OO  ││         ││         ││          │  ← 드래그로  │
││재오픈×1   ││🔴urgent   ││         ││         ││          │     상태 전이│
│└──────────┘└──────────┘└─────────┘└─────────┘└──────────┘             │
│  카드: #번호·유형 / 라벨·담당 / 우선순위 토글 / SLA ⚠(경고)·🔥(초과)     │
│  반려 드롭 → 사유 모달(정책불가/오분류/스팸 + 메모)                      │
└──────────────────────────────────────────────────────────────────────┘
```

### S3. 테스트/배포
- 단위: board 그룹핑·slaState 계산(normal/urgent, warning/overdue 경계), stats 집계(미배정·라벨·평균해결·재오픈율),
  priority 권한.
- 스테이징: 일반 배포(SQL 없음). E2E: amoebaorder 이슈 생성→보드 표시→드래그 해결→라이브챗 딥링크.

## 2. 사이드 임팩트
| 영역 | 영향 | 판단 |
|---|---|---|
| 기존 콘솔 | 신규 페이지+메뉴 추가, LiveChatPage 쿼리 초기선택(비파괴) | 안전 |
| 비-native 테넌트 | 메뉴는 보이되 페이지에서 안내(서버는 어차피 이슈 0) | 안전 |
| API | 읽기 2종+priority 1종 추가 — 기존 계약 불변 | 안전 |

## 3. 산출물
PR-P4a(백엔드) → PR-P4b(콘솔) → 스테이징 배포 → TCR/RPT → P5(지식 폐루프) 대기.

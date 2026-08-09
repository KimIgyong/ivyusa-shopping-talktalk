# RPT-260809-Issue-Workflow-P4

이슈 워크플로우 **P4 — 칸반 보드 + 워크플로우 대시보드** 구현 결과.

- 근거: PLN-260809-Issue-Workflow-P4 (2026-08-09 승인) · 테스트: TCR-260809-Issue-Workflow-P4
- **스키마 변경 없음** · PR #204(PLN) #205(구현) — CI pass·squash-merge, staging 2026-08-09 배포·검증

## 1. 무엇이 생겼나
- **API**: `GET /agent/issues/board`(상태별 그룹, open 전체/종결 최근 20, 담당자명, **계산형 slaState** —
  urgent 4h·normal 24h·70% 경과 경고) · `GET /agent/issues/stats`(상태별 건수·미배정·라벨 분포·
  30일 평균해결·재오픈율·workflowMode) · `PATCH /agent/issues/:id/priority`(담당자/manager+, 감사).
- **콘솔 /issues**: 사이드바 "이슈 보드" 메뉴(라이브챗과 동일 보유자), KPI 바 + 5컬럼 칸반,
  **HTML5 네이티브 드래그&드롭**(라이브러리 무추가) → 기존 P1 전이 API 호출(상태머신·권한 서버 강제,
  반려 드롭은 사유 모달), 카드 우선순위 토글, 카드 클릭 → `/live-chat?conversation=` 딥링크
  (LiveChatPage가 쿼리로 초기 선택 — 세션 행 id=대화 id 확인 완료). 비-native 테넌트는 애드온 안내.
- i18n en/es/ko (nav.issueBoard + livechat.board.*/issue.label.*).

## 2. 남은 일
- 사용자 스모크 E1~E7(TCR §3).
- **P5(지식 폐루프)** — 로드맵 마지막 단계: 고-에스컬레이션 토픽 → 지식갭 태스크 자동 제안(사람 승인, 결정 9),
  3차 해결답변의 KB 캡처 후보 자동 제시. 이미 배포된 답변재사용·best-answer 캡처·ai-coach와 연결.
- 후속 개선 후보: SLA 목표시간 콘솔 설정화, 보드 모바일 터치 드래그.

## 3. 예방 패턴
- 목록 행 id의 의미(세션 vs 대화)는 **mapper 정의로 확인 후 연결** — toSessionResponse.id가 conversation.id임을
  확인하고 딥링크·IssuePanel을 연결(추측 연결이었다면 잘못된 스레드가 열렸다).
- 기존 페이지에 상태 초기화를 추가할 땐 동일 훅의 기존 선언부터 grep(useSearchParams 중복 선언 사례).

# RPT-260825 시나리오 위젯 폴백 수정 · 지정 통합 · 헤더/필터 2줄 — 구현 보고

- 근거: REQ/PLN/TCR-260825-LiveChat-Fixes-ScenarioWidget (PR #371 후속 5건)
- 작업일: 2026-08-25 · 브랜치 `session/livechat-fixes-260825`

## 1. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#373** (squash-merge, main `4ec5a7d`) |
| 마이그레이션 | 해당 없음(프런트 전용) |
| 스테이징 | ✅ 배포·부팅 OK, F1 서버 실측(전부 스코프 아웃→0버튼→원복) 완료 |
| 잔여 | F3~F5 UI 육안(지정 모달·2줄 헤더/필터) — 운영자 확인 권장 |

## 2. 핵심 수정

- **R1 (버그)**: 위젯 `useScenario`의 폴백 조건 역전 — 성공-빈배열에도 하드코딩 6종을 표시해 **에이전트 스코프가 "전부 보임"으로 뒤집히던 결함**. 폴백=에러/미응답 한정, 빈 목록=빈 메뉴(ScenarioMenu 미렌더), staleTime 5분→60초. invisible-fallback-trap의 재발형.
- **R2**: [지정] 통합 모달 — AI 에이전트(전 상담원)/상담원(manager+ 라디오만 노출), 기존 재핀·assign API 재사용, 헤더에 담당 배지 2종.
- **R3**: 상세 헤더 2줄(정보/버튼). **R4/R5**: 목록 필터 2줄(상태 탭/그룹·채널·에이전트). "전체/상담필요/종료 필터링 안 됨" 신고는 **서버·클라 실측 정상**(all 50/queue 14/ended 50) — 한 줄 과밀로 탭이 압축되던 UI 결함으로 진단·해소.

## 3. 파일 (12 files, +299/−87)

widget: `useScenario.ts`·`ChatTab.tsx` — web: `LiveChatPage.tsx`·locales 6종 — docs: REQ/PLN/TCR.

## 4. 검증

typecheck 9/9 · build 6/6 · i18n complete · API 146 suites/1,577 무회귀 · 스테이징 F1 실측(0버튼→원복 6버튼, 스모크 에이전트 정리).

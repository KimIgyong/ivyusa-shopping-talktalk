# RPT-260829 라이브챗 스크롤 분리(필터/헤더 상단 고정) — 구현 보고

- REQ: `docs/analysis/REQ-260829-LiveChat-Sticky-Panes.md`
- PLN: `docs/plan/PLN-260829-LiveChat-Sticky-Panes.md` (승인: 구현 진행)
- TCR: `docs/test/TCR-260829-LiveChat-Sticky-Panes.md`

## 배포 상태

| 항목 | 값 |
|---|---|
| PR | **#460** (squash) → main **`18e2b8e`** |
| 마이그레이션 | 없음 (웹 레이아웃 전용) |
| 스테이징 배포 | **2026-08-29 완료** — 배포 검증은 상태코드가 아닌 **번들 내용으로**: CSS(`index-Dj2oQWoo.css`)에 `100dvh - 112px` 규칙, `LiveChatPage-DUucG2Si.js` 청크에 신규 클래스 실재 확인 |
| 프로덕션 | 미배포 |

## 구현 내용

- **R1 목록 필터/검색 고정**: 좌측 칼럼의 제목줄·상태 탭·그룹/채널/에이전트 필터·검색바를 `sticky top-0 z-10 bg-white` 묶음으로 — 목록 행이 아래로 지나가고 필터는 상시 조작 가능.
- **R2 본문 스크롤 제거(근원)**: 그리드 고정 높이 `calc(100vh-220px)`이 실제 상단 크롬과 어긋나면 body 스크롤이 발생해 세 칼럼 헤더가 통째로 밀리던 구조 — 페이지 래퍼를 `flex h-[calc(100dvh-112px)] flex-col`(112=글로벌 헤더 64+main 패딩 48)로 뷰포트에 잠그고 그리드를 `flex-1 min-h-0`으로 전환. 높이 오차(조건부 배너 등)는 이제 **스크롤이 아닌 그리드 축소**로 흡수.
- 중앙 대화 패널은 기존 flex 구조 유지(상태/버튼 헤더·IssuePanel·컴포저 고정, 메시지만 스크롤) + 세 칼럼·메시지 영역에 `min-h-0` 방어.

## 파일
`apps/web/src/domain/live-chat/LiveChatPage.tsx` 단일 파일(레이아웃 클래스만, 마크업 의미·상태·API 무변경).

## 테스트 결과
- typecheck/build(web) ✅. 워크트리 초기 타입 오류는 내 변경이 아닌 최신 main의 board 도메인 신규 의존성(`@uiw/react-md-editor`) 미설치 — `npm install`로 해소.
- 스테이징: 배포·번들 내용 검증 완료. **S1~S7 육안 실측은 운영 확인 잔여**(목록 스크롤 중 필터 노출·조작, 긴 대화에서 헤더/컴포저 고정, 창 높이별 body 스크롤 부재, 배너 세션 축소 동작, 그룹 룸 무회귀).

## 잔여
- TCR S1~S7 육안 확인. 이상 시 롤백은 커밋 1개 revert로 즉시 가능(스키마 무변경).

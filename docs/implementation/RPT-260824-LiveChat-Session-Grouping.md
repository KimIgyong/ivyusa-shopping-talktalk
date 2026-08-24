# RPT-260824 라이브챗 세션 그룹핑 (타임라인/프로젝트) — 구현 보고

- 근거: REQ/PLN/TCR-260824-LiveChat-Session-Grouping (아메바톡 Bound Chat 실구현 분석 기반)
- 작업일: 2026-08-24 · 브랜치 `session/chat-grouping-260824`

## 1. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | **#352** (squash-merge, main `16ccfe2`) |
| CI | typecheck·test·build 통과 |
| 스테이징 SQL 선적용 | ✅ `migration_chat_groups.sql` → chat_groups·chat_group_members 생성 확인 |
| 스테이징 코드 배포 | ✅ `deploy-staging.sh`, 부팅 `successfully started`, `/agent/groups` 401 |
| 수동 스모크 | ✅ **G1~G10 스테이징 실행 완료** (TCR §3 갱신) — G3 UI 육안·G9 실계정 교차만 유닛/코드 대체 |
| 프로덕션 | 해당 없음 (호스트 미정) |

## 2. 스모크에서 실증된 핵심 동작

- **1:1 발신 격리**: 그룹 룸에서 세션1 지정 발신 → 세션1 위젯만 수신(세션2 위젯 0건). 비멤버 지정은 E5058.
- **세션 단위 그룹핑(D1)**: 대화 종료 후 고객의 새 메시지가 만든 **새 대화방이 그룹 피드에 자동 유입** — 아메바톡의 대화방 스냅샷 방식이 놓치는 지점을 커버.
- **해제 무손상**: 그룹 삭제 후 스모크 대화 3건이 목록에 그대로.
- 병합 피드가 전역 message id 순으로 두 세션을 교차 렌더, 멤버 상세에 채널·target 대화방·수신전용 여부 포함.

## 3. 무엇이 만들어졌나

- **테이블 2**: `chat_groups`(kind=timeline|project 구분자, title≤100), `chat_group_members`(세션 단위, `uq_cgm_group_session`). 해제=하드 삭제.
- **API 9종** (`/agent/groups*`, CONVERSATION_HANDLE, 전 쿼리 tenant 술어): 목록(멤버수+최근메시지 1쿼리 집계)/생성(≥2세션)/상세(멤버·target 대화방)/병합 피드(id 커서)/1:1 발신(열린?최신 대화방 해석 → 기존 `AgentService.sendMessage` 무수정 위임, sms 거부)/수정/멤버 추가·제거(2 미만 거부)/해제. 에러 E5056~E5058, 감사 5종(제목·본문 미기록).
- **콘솔**: 목록 [그룹] 탭·[선택] 모드(체크박스, sessionId 기준 dedupe)·`GroupCreateModal`(새 그룹/기존 그룹 추가, 유형 라디오+힌트)·`GroupRoom`(병합 스트림+세션 표기+수신자 선택 컴포저)·`GroupSettingsModal`(수정/멤버 제거/2단계 해제). i18n ~45키 × 6언어.
- 아메바톡 대비 의도적 차이: 그룹핑 단위 세션(D1), 발신 구현(아메바톡은 UI만)·단 1:1 한정, 이력은 audit_logs 재사용.

## 4. 파일 목록 (27 files, +2,442/−26)

API: `entity/chat-group{,-member}.entity.ts`·`chat-group.service.ts`(+spec 11케이스)·컨트롤러/매퍼/DTO/모듈·`error-code.constant.ts` — web: `GroupCreateModal`·`GroupRoom`·`GroupSettingsModal`(신설), `LiveChatPage`(그룹 탭·선택 모드)·service/hooks·locales 6종 — 기타: `sql/migration_chat_groups.sql`·`artefacts.tsv`·SPEC §6.3·REQ/PLN/TCR.

## 5. 테스트 결과

Jest **136 suites / 1,500 tests** 통과(신규 11), typecheck 9/9·build 6/6·i18n:check complete, dev 실부팅+스키마 일치+신규 라우트 401. 스테이징 스모크 G1~G10 (TCR §3).

## 6. 남은 일 / 범위 밖

- G3(수신자 미선택 시 컴포저 비활성) 실화면 육안 확인 — 콘솔 UI 한 번 열어보면 됨.
- 범위 밖 후속 후보(PLN 기록): 그룹 발신 첨부, 그룹 단위 브리핑·코멘트, 동일 customer_id 자동 그룹핑 제안, 그룹 읽음 처리, 고객사 엔티티.

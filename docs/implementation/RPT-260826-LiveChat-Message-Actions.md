# RPT-260826 라이브챗 핀 고정 · 고객 메시지 액션 4종 — 구현 보고

- REQ: `docs/analysis/REQ-260826-LiveChat-Message-Actions.md`
- PLN: `docs/plan/PLN-260826-LiveChat-Message-Actions.md` (승인: W1~W3 전체, 핀=팀 공유 테넌트당 3개)
- TCR: `docs/test/TCR-260826-LiveChat-Message-Actions.md`

## 배포 상태

| 항목 | 값 |
|---|---|
| PR | **#392** (squash) → main **`43d5b79`** |
| 스테이징 SQL | `sql/260826-conversation-pin.sql` — **2026-08-26 선적용 완료** (`ivy_mysql_staging`, 컬럼 2+인덱스 확인) |
| 스테이징 배포 | **2026-08-26 완료** — `deploy-staging.sh`, 부팅 로그 `successfully started`, `/health` ok, 신규 라우트 401(=배포됨) |
| 프로덕션 | 미배포 (프로덕션 호스트 미정 — 기존 상태 그대로) |

## 구현 내용

### R1 핀 고정 (팀 공유, 테넌트당 3개)
- `conversations.pinned_at/pinned_by` + `idx_conv_tenant_pinned` (엔티티 `@Index` 동반).
- `PATCH /agent/conversations/:id/pin {pinned}` — 4번째 핀 **E5060**(409, warn 로그), 해제는 무조건 허용, 감사 `agent.conversation.pin`.
- `listSessions` ORDER BY 선두 `ISNULL(pinned_at) ASC, pinned_at DESC` (기존 최신메시지 정렬은 addOrderBy 강등 — 핀 없는 테넌트 무회귀, 페이지네이션 안전).
- 콘솔: 목록 행 호버 핀 토글(핀됨=채움 상시표시), 상세 헤더 토글, E5060 전용 토스트.

### R2 메시지 번역 (아메바 로비채팅 미러)
- `POST /agent/messages/:id/translate {lang}` — 소유검증(E5002)·언어 6종(E5003)·실패 E5055(502).
- Redis `msgtr:{id}:{lang}` 24h 캐시, `feature: 'agent_translate'` 계측, `PROMPT_LANGUAGE_NAMES` 재사용.
- 콘솔: 버블 호버 → 팝오버 언어 원클릭(기본 강조=콘솔 언어) → 인라인 틴트 서브버블(언어별 스택·개별 X). "번역 기록" 게시 모드는 미채택(상대=고객).

### R3 지식조회 / R4 답글 인용 (프런트 전용)
- 지식조회: 메시지 본문 → Knowledge lookup 주입 + 스크롤/포커스.
- 답글: 인용 칩(80자 발췌) → 발송 시 `> 발췌\n\n` 조립, 실패 시 원문만 복원·칩 유지.

### R5 메시지 단위 이슈 등록 (+메모)
- `FileIssueRequest`에 `message_id?`/`memo?(≤300)`. 서버가 메시지 본문 직접 조회(위조 불가) → 발췌 120자.
- `createManual` 확장: 신규=CREATED note `[고객] "발췌"\n메모`, 기존=**MEMO 이벤트 append**(`{appended:true}` — 토스트 분기). `uk_issue_conv` 불변, native 게이트 E5059 유지.
- IssuePanel 타임라인 note `whitespace-pre-line`.

### 노출 게이트
- 액션 4종은 `!(status==='ai_active' && autoReplyEffective && mode!=='approve')`일 때만 렌더(approve=상담원 최종발송이므로 수동 취급). 핀은 항상 가능(리스트 관리 기능).

## 파일

백엔드: `agent.service.ts`(+pin/translate/fileIssue 확장·정렬), `agent-console.controller.ts`(라우트 2), `agent.request.ts`(DTO 3), `agent.mapper.ts`(pinned 2필드), `conversation.entity.ts`, `issue.service.ts`(createManual note/append), `error-code.constant.ts`(E5060), **`prompt-language.ts`(신규)**, `briefing.service.ts`, `agent.service.pin.spec.ts`(신규 12), `agent.service.aiagent.spec.ts`(계약 반영), `sql/260826-conversation-pin.sql`, `sql/artefacts.tsv`, `SPEC.md §6.3`.
프런트: `LiveChatPage.tsx`, `live-chat.service.ts`, `live-chat.hooks.ts`(useSetPin/useTranslateMessage), `IssuePanel.tsx`, livechat 로케일 6종(+16키).

## 테스트 결과

- 유닛: 신규 12케이스 포함 **154 suites / 1,638 tests 전체 통과**. typecheck/build/i18n:check ✅.
- **실부팅 게이트가 결함 검출**: `agent.service → briefing.service → agent.service` 순환 import로 BriefingService DI가 undefined → 부팅 실패(tsc 통과). `PROMPT_LANGUAGE_NAMES`를 `prompt-language.ts`로 분리해 해소. 예방: **서비스 간 상수 공유는 서비스 파일이 아닌 독립 모듈에서** (A-1 계열 — tsc가 못 잡는 부팅 실패).
- 스테이징 스모크 (TCR S1~S11 중 API 검증분, 2026-08-26):
  - S1 핀 3개 성공 → 4번째 **409 E5060** ✅ / S2 목록 최상단 3개=핀(최근 핀 순) ✅ / S3 해제 즉시 일반 정렬 복귀 ✅
  - S4 번역 실 LLM 2.3s → 캐시 재호출 0.56s 동일 텍스트 ✅ (en→ko 품질 정상), fr → **400 E5003** ✅
  - S8/S9 amoebaorder(native): 메시지 지정 등록 → 이슈 #92에 MEMO note `[고객] "환불계좌 바꾸고 싶어"\n스모크…` 축적, `appended:true` ✅
  - S11 ivyusa(비-native) → **409 E5059** ✅
  - 스모크 데이터 정리: ivyusa 핀 전체 해제 완료. UI 육안(S5~S7, S10 렌더)은 운영 확인 잔여.

## 잔여

- UI 육안 확인: 팝오버/서브버블/인용 칩/이슈 모달 발췌·메모 (S5~S7·S10).
- 백로그(REQ §5): 메시지 스레딩(reply_to)+위젯 인용 렌더, 상담원 개인 핀, 자동 동시번역, 컴포저 역번역.

# REQ-260824 라이브챗 콘솔 개선 5종 (목록 줄바꿈 · 호출 모달 테넌트 격리 · 브리핑 온디맨드/번역/저장 · 코멘트 · 문서 첨부)

- 작성일: 2026-08-24
- 요청 유형: [요구사항] — 라이브챗(상담 콘솔) UX/보안 개선 5건
- 관련: REQ-260814-Chat-Attachments(첨부 파이프라인), PLN-260807 D1(브리핑 분리 로드), 라이브챗 이슈 워크플로우(P1~P5)

## 0. 요구사항 원문

1. 라이브챗 — 제목·세션과 상태 표시를 줄바꿔서 표시. 현재 대화명과 세션, 출처와 상태가 한 라인에 있어 대화방 구분이 어려움 → 대화방명 / 세션명 / 메시지 출처 / 상태를 줄바꿈하여 노출.
2. 상담원 호출 모달창은 해당 테넌트 화면에서만 노출되어야 한다.
3. AI Briefing은 운영자가 요청했을 때 진행하고, 번역 패널이 추가되어야 한다. 요청에 의해 생성된 브리핑은 저장되어야 한다.
4. 대화방·세션별 코멘트 작성 기능이 추가되어야 한다.
5. 라이브챗에서 상담원은 이미지 파일과 문서 파일(pdf, doc(s), xls)을 전송할 수 있어야 한다.

---

## R1. 세션 목록 행 줄바꿈

### AS-IS
- 목록 행은 `apps/web/src/domain/live-chat/LiveChatPage.tsx:360-389`에서 인라인 렌더링(별도 행 컴포넌트 없음). 1행 flex(`flex items-center justify-between`)에 좌측 **[대화명+연필+세션라벨]**(`SessionAlias.tsx:82-101`, compact), 우측 **[자동응답OFF칩][채널배지][상태배지]**(`ChannelBadge.tsx:49-61`, `StatusBadge.tsx:33-38`)가 모두 몰려 있음.
- 대화명 블록만 `min-w-0 truncate`, 배지들은 `shrink-0` → 좁은 폭에서 **이름이 먼저 잘리고** 배지가 폭을 차지. 별칭이 길거나 채널이 여러 개면 어느 대화방인지 식별이 어려움.
- 2행 = 마지막 메시지 미리보기, 3행 = 생성/마지막답변 시각 (`:390-401`) — 이 둘은 이미 별도 줄.
- ⚠️ 명명 사실: "세션 xxxxxx" 라벨의 id는 실제로는 **conversation id 앞 6자**(`LiveChatPage.tsx:370-372`)이며, 진짜 `sessionId`는 응답에 실려오지만 어디에도 렌더링되지 않음(`agent.mapper.ts:33-36`).
- 상태배지 tone map에 `ai_active`/`agent`가 없어 회색+원문 문자열로 폴백(`StatusBadge.tsx:3-31`) — 줄바꿈과 함께 정리할 부수 결함.

### TO-BE
- 행을 다단으로 재배치: **1줄 = 대화명(별칭/고객명, 전폭 truncate)**, **2줄 = 세션 라벨 + 채널(출처) 배지 + 상태 배지**, 이하 미리보기/시각 줄 유지. 대화명이 배지와 폭을 다투지 않아 식별성이 확보됨.
- `ai_active`/`agent` 상태 tone·라벨 등록.

### Gap
UI 재배치만으로 충족. 백엔드/계약 변경 없음.

---

## R2. 상담원 호출 모달 테넌트 격리 (보안 결함)

### AS-IS — 교차 테넌트 누출 실재
- 모달 `EscalationAlarm.tsx`는 `AppLayout.tsx:76`에 전역 마운트(의도된 설계, "any page에서 발화"). 플랫폼 어드민은 `capabilitiesFor`가 빈 집합을 줘 이미 제외(`rbac.ts:68`).
- 데이터 생산은 정상: `chat.service.ts:1063,1138` → `agent-alert.service.ts:86`이 `tenantId`를 올바르게 저장하고 인덱스(`idx_alert_tenant`)도 존재.
- **결함은 조회 경로**: `agent-console.controller.ts:72`의 `alerts()`만 같은 컨트롤러의 다른 모든 핸들러와 달리 `tenantOf(user)`를 서비스에 넘기지 않고, `AgentAlertService.list()`(`agent-alert.service.ts:142-154`)의 where 두 분기 모두 `tenantId` 술어가 없음. 브로드캐스트 알림(`targetUserId IS NULL`, 기본 경로)은 **전 테넌트의 콘솔 10초 폴링에 노출**되고, "상담 열기"는 타 테넌트 conversationId로 딥링크됨.
- 부수 결함: `ack()`(`:156-166`)도 테넌트/소유 검증 없는 id 단건 조회 → 교차 테넌트 IDOR(모달 "닫기"가 이 ack를 호출하므로 사고로도 발생). 중복 생성 방지 조회(`:68-74`)도 tenantId 누락(저위험). `agent-alert.service.spec.ts` 부재 — 테넌시 단정 테스트 0건.
- select 측 자동 스코핑 안전망 없음(`tenant.subscriber.ts`는 `beforeInsert`만).

### TO-BE
- `list()`·`ack()`·중복방지 조회에 tenant 술어/가드 추가, 컨트롤러에서 `tenantOf(user)` 전달. 프런트 변경 불요(`useTenantKey`가 캐시를 이미 분리).
- `agent-alert.service.spec.ts` 신설: 타 테넌트 알림 미노출·타 테넌트 ack 거부 단정.
- 거부 가드에 `logger.warn`(4xx 무로그 함정 예방).

### Gap
멀티테넌시 MUST("Never leak cross-tenant data") 위반의 실결함 → 최우선 수정.

---

## R3. AI 브리핑 — 온디맨드 생성 · 번역 패널 · 저장

### AS-IS
- 대화를 열면 **자동으로** `GET /agent/conversations/:id/briefing` 호출(`live-chat.hooks.ts:115-123`, `enabled:!!id`) → `agent.service.ts:641-669`가 매 요청 LLM 호출(ASSIST, 최근 50메시지, 고정 영어 프롬프트) → 결과는 **Redis 15분 캐시뿐, DB 저장 없음**(키 `agent:briefing:{convId}:{lastMsgId}`). Redis 미가용 시 캐시 자체가 스킵.
- 새 턴마다 캐시키가 바뀌어 재생성 → 운영자가 원치 않아도 대화 열람마다 토큰 소모.
- 번역 기능 전무(리포 전체에 번역 서비스/엔드포인트 없음). 실패는 삼켜져 `''` 반환("브리핑 없음"으로 표시) — 실패와 미생성 구분 불가.
- UI는 우측 레일 카드 1장, 평문 `<p>`, 버튼 없음(`LiveChatPage.tsx:709-722`).

### TO-BE
- **자동 생성 제거.** 카드에 [브리핑 생성] 버튼 → `POST` 생성 시에만 LLM 호출.
- 생성 결과는 **DB 저장**(신규 `conversation_briefings`: tenant_id, conversation_id, last_message_id, body, requested_by, created_at, translations JSON). `GET`은 저장분 조회 전용(LLM 미호출). 재생성은 새 행(이력 보존), 패널은 최신본 표시.
- **번역 패널**: 대상 언어(시스템 6종 en/es/ko/vi/ja/zh, `packages/types/.../language.ts` 단일 소스) 선택 + [번역] → LLM 번역, 결과는 해당 브리핑 행 `translations[lang]`에 저장(동일 언어 재요청 시 저장분 반환).
- 생성/번역 실패는 명시 에러(E5054)로 표면화 + 토스트.

### Gap
엔드포인트 의미 변경(GET 생성→조회, POST 신설), 신규 테이블 1, 번역 신규.

---

## R4. 대화방·세션별 코멘트

### AS-IS
**전무.** comment/memo/note 성격의 기능이 상담 도메인에 없음. 유사물은 (a) `sessions.alias`(60자 표시명), (b) 이슈 전이 사유 note(`IssuePanel.tsx`, `issue_events` — 상태 전이 1회성), (c) `diary_notes`(고객 본인 쇼핑 다이어리 — 무관). `messages`에는 내부 전용 플래그가 없어 메시지로는 대체 불가(고객에게 노출됨).

### TO-BE
- 신규 `chat_comments` 테이블: tenant_id, scope(conversation|session), conversation_id/session_id(스코프에 따라 택일), author_id, body, created_at, updated_at. **내부 전용**(위젯/고객에게 절대 미노출).
- 대화방 코멘트 = 해당 대화방에서만 표시. 세션 코멘트 = 같은 세션의 모든 대화방에서 표시(재방문 고객 맥락 인계 용도).
- 우측 레일에 코멘트 카드(스코프 탭 [대화방]/[세션]) — 목록·작성·본인 수정/삭제(마스터는 삭제 가능).
- 작성/수정/삭제 성공·실패 토스트(dev-kit §4.3 MUST).

### Gap
테이블·API·UI 전부 신규.

---

## R5. 상담원 문서 파일 전송 (pdf, doc(s), xls)

### AS-IS — 요구의 대부분이 기구현 (PR #287/#288)
- 콘솔 컴포저에 클립 버튼+파일 선택 존재(`LiveChatPage.tsx:653-676`), accept = 이미지 8종 + **`.pdf,.txt,.csv,.docx,.xlsx`**. 업로드 `POST /agent/conversations/:id/attachments`(테넌트 소유 검증 후 저장), 확장자∧선언MIME∧매직바이트 3중 검증(`file-type.util.ts`), 이미지 10MB/문서 20MB/메시지당 5개.
- 위젯은 방향 무관하게 첨부를 렌더링 — 상담원 발신 PDF는 이미 다운로드 카드로 수신됨. 텔레그램/바이버 어댑터도 `sendDocument` 분기 완비.
- **갭**: 구형 Office 포맷 `.doc`/`.xls`(OLE2/CFB 컨테이너)는 확장자·SPECS에 없어 거부(E5036). 요구 문구 "docs, xls"가 이 구형 포맷을 포함한다고 해석.

### TO-BE
- `.doc`/`.xls` 수용: `file-type.util.ts` SPECS에 OLE2 매직(`D0 CF 11 E0 A1 B1 1A E1`) 엔트리 추가 + 콘솔/위젯 accept 문자열·`FILE_EXT` 배열 반영. (docx/xlsx의 zip-only 검증과 동수준의 컨테이너 검증 — 기존 정책과 동일 강도.)
- 악성코드 검사는 기존 정책대로 범위 밖(REQ-260814 §결정 유지).

### Gap
소규모 화이트리스트 확장. 신규 파이프라인 불요.

---

## 사용자 플로우 (TO-BE 요약)

1. 상담원이 라이브챗 목록에서 **이름 1줄 + 세션/출처/상태 1줄**로 대화방을 식별 → 진입.
2. 타 테넌트 고객이 상담원을 호출해도 **내 콘솔에는 모달이 뜨지 않음**(내 테넌트 호출만 수신).
3. 상담원이 필요할 때 [브리핑 생성] → 요약 확인 → 필요 시 대상 언어 선택 후 [번역] → 생성·번역본은 저장되어 재방문 시 즉시 표시.
4. 상담원이 대화방/세션 코멘트를 남김 → 같은 세션의 후속 대화방에서 세션 코멘트가 보임.
5. 상담원이 pdf/doc/docx/xls/xlsx/이미지를 전송 → 고객 위젯·외부 채널에 파일 카드로 도착.

## 제약·전제

- 멀티테넌시 MUST, 모더레이션 MUST(브리핑·번역은 상담원 내부 표시물이라 고객 발신 경로 아님 — 아웃바운드 모더레이션 대상 아님, 단 기존 첨부 전송 경로의 정책 유지).
- 스테이징 `DB_SYNCHRONIZE=false` → 신규 테이블 2종은 `sql/` 수동 선적용 + `migrations:manifest` + PR `## Migration` 섹션 필수.
- i18n 6개 언어 키 추가 + `npm run i18n:check` 통과. 하드코딩 문구 금지.
- 언어 목록은 `packages/types/src/common/language.ts` 단일 소스에서만 가져옴(재나열 금지, 값 import는 deep-import).
- 브리핑/번역 LLM 사용량은 온디맨드 전환으로 오히려 감소 예상(현행: 열람마다 자동 생성).

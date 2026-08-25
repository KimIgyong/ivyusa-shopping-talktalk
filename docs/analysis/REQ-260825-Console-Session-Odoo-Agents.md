# REQ-260825 콘솔 세션 연장 · Odoo 로그인 경로 · AI 에이전트별 설정 · 라이브챗 에이전트 표시/지정

- 작성일: 2026-08-25
- 요청 유형: [요구사항] — 8건 묶음 (콘솔 세션 / Odoo 위젯 / /ai-setting 에이전트별 설정 3종 / /live-chat 에이전트 표시·필터·지정 3종)

## R1. 콘솔 작업 세션 1시간 이상

### AS-IS — 15분마다 강제 로그아웃되는 구조적 원인 3중
1. 액세스 토큰 TTL **900초(15분)** (`JWT_ACCESS_TTL` 기본·스테이징 동일).
2. 웹 콘솔에 **`/auth/refresh` 호출 코드가 전무** — 401 인터셉터는 곧장 `store.clear()`+로그인 리다이렉트(#356의 제외 목록은 리다이렉트 제외지 리프레시가 아님). 백엔드 리프레시 엔드포인트(단일사용 회전·7일)는 완비돼 있으나 **클라이언트가 없음**.
3. 리프레시 토큰은 메모리 전용(FE-H1: XSS 반경 밖 — localStorage 미저장, 의도된 보안 결정).
→ 로그인 후 15분이 지나면 다음 API 호출(백그라운드 폴 포함)에서 무조건 로그인 페이지로 튕김.
- 부수 발견: self-hosted env 템플릿이 `JWT_ACCESS_TTL=15m` 문자열 — `Number('15m')=NaN`으로 코드 파서와 불일치(결함).

### TO-BE
- 액세스 TTL **900→3600(1시간)**: 코드 기본값 + dev/staging/prod/self-hosted 템플릿 + CONFIG/SPEC + **스테이징 실서버 `.env.staging` 수정·재기동**.
- **자동 리프레시 도입**: 401 시 메모리의 리프레시 토큰으로 `/auth/refresh` 1회(single-flight, 동시 401 대기열) → 새 토큰으로 원요청 재시도. 리프레시 실패/부재 시에만 기존 로그아웃 리다이렉트. → 탭을 열어둔 작업 세션은 리프레시 TTL(7일)까지 지속.
- FE-H1 유지(리프레시 토큰 저장 안 함): **페이지 리로드 후엔 액세스 토큰 잔여 수명(≤1h)만** — 문서에 명시. self-hosted 템플릿 값 형식 수정.

## R2. Odoo 채팅위젯 sign-in URL

### AS-IS
- 로더(`embed.js`)의 로그인 경로는 cafe24 호스트 여부의 이분법: cafe24 외 전부 `/account/login?return_url=…`(Shopify 형식). **Odoo의 실제 경로는 `/web/login?redirect=…`**.
- `IVY_WIDGET_CONFIG.loginPath/loginReturnParam/hideOnPaths` 오버라이드는 이미 지원되지만, 콘솔의 **Odoo 설치 스니펫에 이 값들이 없음**(cafe24 스니펫만 주입) → Odoo 테넌트(skyliving, tenant 5)가 콘솔 안내대로 설치하면 잘못된 경로. 로그인 페이지 숨김 목록에도 `/web/login`이 없어 일회성 복귀 플래그(`ivy:reopen`) 소진 문제 동반. 플랫폼 컬럼/enum은 없음(설치 가이드 UI 탭 키뿐).

### TO-BE
- 콘솔 Odoo 설치 스니펫에 `loginPath: '/web/login'`, `loginReturnParam: 'redirect'`, `hideOnPaths: ['/web/login', '/web/signup']` 포함 + 설치 가이드 문구 반영.
- 로더는 무수정(오버라이드 메커니즘 기존재). **이미 설치된 skyliving 몰의 스니펫 교체는 운영 액션**으로 RPT에 기재.

## R3~R5. /ai-setting — 에이전트별 설정

### AS-IS
- `ai_agents`: code/name/persona/rules/active/is_default — **name은 콘솔 라벨일 뿐 위젯에 노출 안 됨**. 위젯은 자기 세션의 에이전트를 아예 모름(SessionResponse에 필드 없음); 헤더 표시명은 테넌트 `widget_copy.displayName`.
- 첫 응답 메시지(`firstVisit`)는 `tenants.widget_copy` **테넌트 전역**(6언어 Record). 위젯 welcome 버블은 클라이언트 렌더(`/session/ensure` 응답의 widgetCopy).
- 시나리오 버튼은 `tenant_ai_config.scenario_buttons` **명시적 테넌트 공통**(카드 제목에 "모든 에이전트 공통"). 버튼 shape `{id,label,action,enabled}`, 저장 시 `sanitize()`가 이 4필드만 재조립 — **신규 필드는 조용히 삭제되는 함정**. 위젯 버튼 조회(`getScenarioForSession`)는 session(aiAgentId 포함)을 이미 들고 있으나 무시.

### TO-BE
- **R4 에이전트별 이름**: `ai_agents.display_name`(위젯 표기용, NULL=테넌트 표시명) 추가. 세션의 에이전트에 표시명이 있으면 `/session/ensure`의 widgetCopy.displayName을 오버라이드 → 위젯 헤더에 에이전트 이름 노출(위젯 무수정).
- **R3 에이전트별 첫 응답 메시지**: `ai_agents.greeting`(JSON, 6언어, NULL=테넌트 firstVisit) 추가, 동일하게 `firstVisit` 오버라이드. 콘솔 `AgentModal`에 표시명 + 첫 응답 메시지(언어 탭) 입력.
- **R5 시나리오 버튼 에이전트 스코프**: `ScenarioButton`에 `agentIds?: number[]`(비어있음=전체 공통) 추가 — sanitize 동반 수정. `getScenarioForSession`이 세션 에이전트(null이면 테넌트 기본 에이전트로 해석)로 필터. UI: 버튼 행 **삭제 버튼 왼쪽에 [에이전트] 버튼** → 모달에서 "전체 공통" 또는 에이전트 다중 선택. 유형은 구분자·동작 분기 없음 원칙 유지(표시 여부만).

## R6~R8. /live-chat — 에이전트 표시·필터·지정

### AS-IS
- 목록/상세 payload에 AI 에이전트 정보 전무(수화 중인 `sessionStates` 조회에 aiAgentId 한 줄 추가로 해결 가능). `conversations.agentId`(사람 상담원)도 매핑 안 됨.
- 채널 필터가 복제할 모델(쿼리 파라미터→where), 단 `ai_agent_id`는 sessions 테이블이라 서브쿼리 필요 + **인덱스 없음**.
- `/ai-agents` 목록은 `AI_SETTINGS_MANAGE`(manager+) — **staff 상담원은 403** → 필터 드롭다운용 슬림 조회 필요.
- **세션 에이전트 변경 엔드포인트 없음**(생성 시 1회 고정). 변경 시 영향: 페르소나 캐시는 에이전트별 키라 무해, **토큰→세션 캐시(30s)만 버스트** 필요(`setSessionAutoReply` 선례).
- **상담원 지정**: 이슈 경유(`POST /agent/issues/:id/assign`, manager+)만 존재 — 이슈 없으면 지정 불가. `CONVERSATION_ASSIGN` 캐퍼빌리티는 예약만(참조 0곳). 자기 수락(accept)만 대화 단위.
- **이슈 수동 생성 없음**: 이슈는 에스컬레이션 이벤트로만 생성(native 테넌트 게이트). IssuePanel은 이슈 없으면 아무것도 안 그림.

### TO-BE
- **R6 목록 표시**: 행 1줄을 flex로 재구성 — 좌측 대화명(truncate), **우측에 담당 AI 에이전트명**(작은 배지, 우측 정렬; 세션 에이전트 null이면 테넌트 기본 에이전트명).
- **R7 필터**: 목록 헤더에 에이전트 셀렉트(전체/에이전트별) — 신규 `GET /agent/ai-agents`(CONVERSATION_HANDLE, id·name·isDefault만) + `ListSessionsQuery.ai_agent_id` + sessions 서브쿼리 + `(tenant_id, ai_agent_id)` 인덱스.
- **R8 상세 헤더**: ① **AI 에이전트 지정**(변경) — `PATCH /agent/conversations/:id/ai-agent`, 다음 턴부터 새 페르소나, 캐시 버스트+감사. ② **상담원 지정** — `POST /agent/conversations/:id/assign {user_id}`: `CONVERSATION_ASSIGN`(manager+) 첫 실사용, assignments 전환+conversations.agentId+status='agent', 감사. staff에게는 버튼 미노출(기존 수락만). ③ **이슈로 등록** — `POST /agent/conversations/:id/issue {type}`: 수동 생성(native 게이트, 중복 시 기존 이슈 반환), 고객 통지는 하지 않음(내부 정리 목적 — 에스컬레이션 자동 생성과 구분), 생성 후 IssuePanel 즉시 표시.

## 사용자 플로우 (요약)

1. 상담원이 1시간 넘게 작업해도 세션 유지(백그라운드 자동 갱신).
2. skyliving(Odoo) 몰에서 위젯 [로그인] → `/web/login?redirect=원페이지`로 정상 이동.
3. 운영자가 에이전트 A에 표시명 "Livy"·전용 인사말 등록 → A 배정 세션의 위젯은 헤더/첫 메시지가 A 기준.
4. 시나리오 버튼 "배송 조회"를 A 전용으로 → B 배정 세션에는 미노출.
5. 라이브챗 목록에서 행마다 담당 에이전트가 보이고, 에이전트별로 필터.
6. 상세에서 에이전트 교체(다음 응답부터), 매니저가 상담원 지정, 필요 시 이슈로 등록.

## 제약·전제

- 스키마 변경: `ai_agents` 2컬럼 + `sessions` 인덱스 1 (SQL 선적용 + manifest + PR Migration 섹션).
- 시나리오 sanitize 함정(신규 필드 삭제) 동반 수정 필수. 멀티테넌시·i18n 6언어·토스트 MUST.
- FE-H1(리프레시 토큰 미저장) 유지 — 리로드 후 최대 1h 제한은 수용(문서화).
- 범위 밖(백로그): 서버 전달형 loginPath(테넌트 컬럼), 플랫폼 enum, 에이전트별 시나리오 **응답 문안** 분리(스코프는 노출 여부만), 이슈 수동 생성 시 고객 통지 옵션, staff용 users 슬림 조회.

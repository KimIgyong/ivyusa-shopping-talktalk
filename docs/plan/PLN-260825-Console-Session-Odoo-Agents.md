# PLN-260825 콘솔 세션 연장 · Odoo 로그인 · 에이전트별 설정 · 라이브챗 에이전트 구현 계획

- 근거: `docs/analysis/REQ-260825-Console-Session-Odoo-Agents.md`

## 핵심 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 세션 연장 = **TTL 3600 + 401 자동 리프레시(single-flight)** 병행 | TTL만 늘리면 1h에서 또 끊김; 리프레시만 넣으면 리로드 직후 즉끊김 유지. 둘을 합치면 활성 세션 7일·리로드 후 ≤1h |
| D2 | 리프레시 토큰 저장 안 함(FE-H1 유지) | 7일 자격증명을 XSS 반경에 두지 않는 기존 보안 결정 존중 |
| D3 | Odoo는 **스니펫 값 3종**으로 해결(로더 무수정) | loginPath/returnParam/hideOnPaths 오버라이드가 기구현 — cafe24 스니펫과 동일 문법 |
| D4 | 에이전트별 표시명·인사말은 **서버측 widgetCopy 오버라이드** | 위젯 무수정 — `/session/ensure` 조립 시 에이전트 값이 있으면 대체, NULL이면 테넌트 값 |
| D5 | 시나리오 스코프 = 버튼의 `agentIds[]`(빈=공통), **노출 여부만** | "구분자·동작 분기 없음" 원칙 유지; 세션 aiAgentId NULL은 테넌트 기본 에이전트로 해석해 매칭 |
| D6 | 상담원 지정은 `CONVERSATION_ASSIGN`(manager+) 첫 실사용 | 예약된 캐퍼빌리티와 정합; staff는 기존 [수락]만(버튼 미노출) |
| D7 | 이슈 수동 등록은 고객 통지 없음, 중복 시 기존 이슈 반환 | 내부 정리 목적 — 자동(에스컬레이션) 경로와 구분; `uk_issue_conv` 활용 |

## 스키마 — `sql/260825-agent-console.sql`

```sql
ALTER TABLE ai_agents
  ADD COLUMN display_name VARCHAR(100) NULL AFTER name,   -- 위젯 표기명 (NULL=테넌트 표시명)
  ADD COLUMN greeting JSON NULL AFTER persona;            -- lang→첫 응답 메시지 (NULL=테넌트 firstVisit)

ALTER TABLE sessions
  ADD INDEX idx_sessions_tenant_agent (tenant_id, ai_agent_id);  -- R7 필터
```
롤백: 컬럼 2 DROP + 인덱스 DROP. `migrations:manifest` 갱신.

## 단계·작업

### W1. 콘솔 세션 연장 (R1)
- `JWT_ACCESS_TTL` 기본 900→3600(`global.module.ts`) + dev/staging/prod 템플릿 3600 + self-hosted `15m`→`3600` 형식 결함 수정 + CONFIG.md/SPEC §JWT 갱신.
- `api-client.ts`: 401 인터셉터에 리프레시 삽입 — 진행 중 리프레시 promise 공유(single-flight), 성공 시 스토어 갱신+원요청 1회 재시도, 실패/리프레시 토큰 부재/`/auth/refresh` 자체 401 시 기존 clear+리다이렉트. 공개 인증 경로 제외 목록 유지, `/auth/refresh`도 제외 목록에 추가(무한루프 방지).
- auth-store: `setTokens` 액션(액세스+리프레시 회전 반영).
- 스테이징 서버 `.env.staging` `JWT_ACCESS_TTL=3600` 수정(배포 시).

### W2. Odoo 스니펫 (R2)
- `SettingsPage.tsx`: odoo 설치 가이드 스니펫에 `loginPath:'/web/login'`, `loginReturnParam:'redirect'`, `hideOnPaths:['/web/login','/web/signup']` 포함(cafe24 스니펫과 동일 방식) + 가이드 i18n 문구.
- skyliving 실몰 스니펫 교체는 운영 액션(RPT 기재).

### W3. 에이전트 표시명·인사말 (R3·R4)
- 엔티티/DTO/매퍼/서비스: `displayName`, `greeting`(6언어 키 검증, 빈 문자열=해당 언어 삭제) — create/update PATCH 의미론 유지.
- `session.service` 위젯 카피 조립: 세션의 에이전트(aiAgentId ?? 테넌트 기본) 로드 → `displayName`/`firstVisit` 오버라이드.
- `AgentModal`(AgentsSection): 표시명 입력 + 첫 응답 메시지 언어 탭(기존 LanguageTabs 재사용). 프리뷰 세션은 이미 에이전트 지정 생성이라 콘솔 미리보기로 즉시 확인 가능.

### W4. 시나리오 버튼 에이전트 스코프 (R5)
- `ScenarioButton`에 `agentIds?: number[]` + **`sanitize()` 동반 수정**(함정: 미수정 시 저장에서 조용히 소실) + 존재하지 않는/타 테넌트 agent id는 저장 시 필터.
- `getScenarioForSession`: 세션 에이전트 id(NULL→기본 에이전트 id) 기준 `agentIds` 필터.
- UI(버튼 행): 삭제 버튼 왼쪽에 [에이전트] 버튼(선택 수 배지) → 모달: "모든 에이전트 공통" 라디오 / "선택한 에이전트만" + 체크박스 목록. 카드 부제 "모든 에이전트 공통" → "버튼별 에이전트 지정 가능"으로 조정.

### W5. 라이브챗 목록 표시·필터 (R6·R7)
- `listSessions`: `sessionStates` select에 `aiAgentId` 추가 + 페이지 내 distinct 에이전트 이름 배치 조회(+기본 에이전트 해석) → `toSessionResponse`에 `aiAgentId`/`aiAgentName` 추가(상세도 `sessionStateFor` 경유로 동일 확장).
- 필터: `ListSessionsQuery.ai_agent_id` + sessions 서브쿼리(q 필터와 동일 스타일). 신규 **`GET /agent/ai-agents`**(CONVERSATION_HANDLE, `{id,name,displayName,isDefault}`만 — staff 403 문제 해소).
- UI: 행 1줄 flex화 — 좌 `SessionAlias`(min-w-0) / 우 에이전트명(`shrink-0` 소형 배지). 헤더에 에이전트 셀렉트(채널 셀렉트 옆).

### W6. 상세 헤더 — 지정 3종 (R8)
- **AI 에이전트 지정**: `PATCH /agent/conversations/:id/ai-agent {ai_agent_id}` — 세션 업데이트+`sessionCacheKey` 버스트+감사(`agent.session.ai_agent`), E5050 재사용. 헤더에 에이전트 배지 클릭→선택 드롭다운.
- **상담원 지정**: `POST /agent/conversations/:id/assign {user_id}` — `@RequireCapability(CONVERSATION_ASSIGN)`, `IssueService.assign`과 동일한 assignments 전환+`conversations.agentId`+`status='agent'`(+열린 이슈 있으면 assignee 동기화), 감사. 헤더 [상담원 지정] 버튼(manager+만) → 모달(users 셀렉트 — 기존 `useUsers`).
- **이슈로 등록**: `POST /agent/conversations/:id/issue {type}` — `IssueService.createManual`: native 게이트(비-native → **E5059 `ISSUE_WORKFLOW_NOT_ENABLED`** 신설), `uk_issue_conv` 중복 시 기존 이슈 반환, CREATED 이벤트+감사, **고객 통지 없음**(D7). 헤더 [이슈로 등록] 버튼(이슈 없을 때만) → 유형 선택 모달(ISSUE_TYPES 6종) → 생성 후 IssuePanel 즉시 렌더.

### W7. i18n(6언어)·유닛 스펙·TCR·RPT·SPEC §6.3(컬럼 주석)

## 와이어프레임

### ① 목록 행 (R6) + 필터 (R7)
```
[전체|상담필요|종료|그룹] [채널▾] [에이전트▾]      ┌──────────────────────────────┐
                                                │ 홍길동 ✎            〔Livy〕   │ ← 1줄: 이름(좌)·에이전트(우)
  에이전트▾ = 전체 / 기본(Livy) / 진(Jin) …       │ 세션 4f9a2c   [위젯] [AI응답중] │
                                                │ 마지막 메시지…                 │
                                                └──────────────────────────────┘
```

### ② 상세 헤더 (R8)
```
┌ 홍길동 ✎  세션 4f9a2c [AI응답중] [AI:Livy ▾] (자동응답)   [상담원 지정] [이슈로 등록] [수락][종료] ┐
   └ AI:Livy ▾ 클릭 → 에이전트 목록에서 교체(다음 응답부터 적용 안내)
┌ 상담원 지정 ─────────────┐   ┌ 이슈로 등록 ────────────────┐
│ 상담원 [김상담 ▾]         │   │ 유형 [배송 ▾] (6종)          │
│  [취소] [지정]            │   │ 등록해도 고객에게 알리지 않습니다│
└─────────────────────────┘   │  [취소] [등록]               │
                              └─────────────────────────────┘
```

### ③ AgentModal 확장 (R3·R4)
```
┌ AI 에이전트 편집 ────────────────────────┐
│ 이름(콘솔) [Livy-agent   ]  코드 [livy]  │
│ 표시명(위젯) [Livy        ]  ← 비우면 상점 표시명 │
│ 첫 응답 메시지  [EN|ES|KO|VI|JA|ZH]      │
│ ┌─────────────────────────────────┐    │
│ │ 안녕하세요! Livy예요. 무엇을 도와드릴까요? │    │
│ └─────────────────────────────────┘    │
│   비우면 상점 공통 첫 메시지 사용            │
└─────────────────────────────────────────┘
```

### ④ 시나리오 버튼 행 (R5)
```
[라벨입력][액션▾][☑사용]  … [답변편집][↑][↓] [에이전트(2)] [🗑]
                                        └ 모달: (●) 모든 에이전트 공통
                                               ( ) 선택한 에이전트만
                                                  ☑ Livy  ☑ 진  ☐ 기본
```

## 부수영향 분석

- 자동 리프레시: 콘솔 전 API 공통 경로 변경 — 실패 시 기존 동작(로그아웃)으로 폴백이라 최악의 회귀는 현행 유지. `/auth/refresh` 제외 목록 누락 시 무한루프 위험 → 유닛으로 고정.
- widgetCopy 오버라이드는 `/session/ensure` 경로 — 에이전트 조회 1회 추가(세션 캐시 30s 뒤에서 호출 빈도 낮음).
- sanitize 수정은 기존 저장 데이터와 호환(agentIds 없는 버튼=공통 유지, 마이그레이션 불필요).
- 상담원 지정은 이슈 배정과 같은 assignments 전환 로직 — 기존 accept/handback 흐름과 상태 일관.

## 마이그레이션·검증 (MUST)

SQL 1파일(ai_agents 2컬럼+sessions 인덱스) 스테이징 선적용 → 코드 배포. 엔티티 변경 실부팅 확인. 유닛: 리프레시 single-flight/무한루프 방지, widgetCopy 오버라이드(NULL 폴백), 시나리오 필터(공통/지정/기본 에이전트 해석)+sanitize 보존, listSessions 에이전트 필터 테넌시, 에이전트 변경 캐시 버스트, assign 권한·전환, 이슈 수동 생성(native 게이트·중복·무통지). id 비교는 문자열 픽스처.

## 범위 밖 (기록)

서버 전달형 loginPath·플랫폼 enum, 에이전트별 시나리오 응답 문안, staff용 users 슬림 조회, 이슈 수동 생성 고객 통지 옵션, 리프레시 토큰 영속화(보안 재검토 필요).

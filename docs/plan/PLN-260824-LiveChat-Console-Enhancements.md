# PLN-260824 라이브챗 콘솔 개선 5종 구현 계획

- 근거: `docs/analysis/REQ-260824-LiveChat-Console-Enhancements.md`
- 원칙: 적정기술(기존 파이프라인 재사용 최대화), 승인 후 구현

## 단계 구성 (권장 시행 순서)

| 단계 | 내용 | 성격 | 규모 |
|---|---|---|---|
| S1 | R2 상담원 호출 테넌트 격리 | 보안 수정 (백엔드만) | 소 |
| S2 | R1 목록 행 줄바꿈 + 상태 tone 정리 | UI만 | 소 |
| S3 | R5 `.doc`/`.xls` 수용 | 화이트리스트 확장 | 소 |
| S4 | R4 대화방·세션 코멘트 | 신규 테이블+API+UI | 중 |
| S5 | R3 브리핑 온디맨드·저장·번역 | 엔드포인트 개편+신규 테이블+UI | 중 |

S1~S3은 마이그레이션 없음 → 먼저 배포 가능. S4·S5는 스키마 변경(스테이징 SQL 선적용 필수).

---

## S1. 상담원 호출 테넌트 격리 (R2) — no UI impact

백엔드 4점 수정 + 테스트 신설. 프런트 무변경.

1. `agent-console.controller.ts:69-73` — `alertService.list(status, actorIdOf(user), tenantOf(user))`로 tenant 전달 (같은 컨트롤러의 타 핸들러와 동형).
2. `agent-alert.service.ts list()` — where 두 분기 모두에 `tenantId` 술어 추가. `tenantId == null`(이론상 어드민)일 땐 빈 배열 반환(어드민은 capability로 이미 차단되지만 방어).
3. `ack()` — 조회에 tenant 술어 추가, 불일치 시 `ERROR_CODE.NOT_FOUND`(존재 노출 방지) + `logger.warn`(4xx 무로그 함정).
4. 중복 생성 방지 조회(`:68-74`)에 `tenantId` 추가.
5. **`agent-alert.service.spec.ts` 신설**: ①A테넌트 알림이 B테넌트 list에 안 나옴 ②broadcast(targetUserId NULL)도 tenant 내로만 ③타 테넌트 ack 거부 ④자기 테넌트 정상 경로. bigint PK는 문자열 픽스처 사용.

부수영향: 알림 폴링 쿼리 형태 변경 — `idx_alert_tenant` 인덱스 기존재로 성능 문제 없음. Slack/이메일 통지 경로는 미변경.

## S2. 목록 행 줄바꿈 (R1)

### 와이어프레임 — 목록 행 (현행 → 변경)

```
[현행]                                          [변경]
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ 홍길동… ✎ 세션 4f9a2c  [위젯][상담원]│   │ 홍길동 (별칭/고객명, 전폭 truncate) ✎ │
│ 마지막 메시지 미리보기…               │   │ 세션 4f9a2c   [위젯] [상담원중]      │
│ 생성 8/24 10:12 · 마지막답변 5분전    │   │ 마지막 메시지 미리보기…               │
└──────────────────────────────────┘   │ 생성 8/24 10:12 · 마지막답변 5분전    │
  (1줄에 전부 → 이름이 먼저 잘림)         └──────────────────────────────────┘
```

- 1줄: `SessionAlias`에서 세션 라벨을 분리한 이름+연필만(전폭 `truncate`). 자동응답 OFF 칩은 2줄 우측으로 이동.
- 2줄: 세션 라벨(좌) + [자동응답OFF][채널][상태] 배지(우) — `flex items-center justify-between`.
- `SessionAlias`에 `sessionLabelPosition`(inline|hidden) 같은 소극적 prop 추가로 상세 헤더(`:417-435`) 사용처는 무변경 유지.
- `StatusBadge` tone map에 `ai_active`(파랑 계열)·`agent`(보라/초록 계열) 등록 + i18n 라벨 키 6개 언어.
- 행 높이 1줄 증가 → 목록 컬럼은 이미 `overflow-y-auto`라 영향 없음.

부수영향: `SessionAlias`는 상세 헤더와 공유 — prop 기본값을 현행 동작으로 두어 무회귀. 스냅샷/유닛 테스트 없음(해당 컴포넌트), 수동 확인 항목으로 TCR에 기재.

## S3. `.doc`/`.xls` 수용 (R5) — UI 변화는 accept 목록뿐

1. `file-type.util.ts` SPECS에 `doc`/`xls` 엔트리: OLE2/CFB 매직 `D0 CF 11 E0 A1 B1 1A E1`, MIME `application/msword` / `application/vnd.ms-excel`. (docx/xlsx의 zip-container 검증과 동일 강도 — 컨테이너 내부 판별은 기존 정책대로 하지 않음.)
2. 콘솔 `LiveChatPage.tsx:659` accept + `useAgentUpload.ts FILE_EXT`에 `doc,xls` 추가.
3. 위젯 업로드 accept/확장자 목록도 동일 확장(고객→상담원 방향 대칭 — 같은 유틸이 검증하므로 서버는 공통).
4. 크기 한도는 기존 문서 20MB 유지.

부수영향: 외부 채널 발신은 kind=file 분기(`sendDocument`)를 이미 타므로 무변경. E5041 미사용 등 잔여 갭은 이번 범위 밖(REQ에 기록만).

## S4. 대화방·세션 코멘트 (R4)

### 스키마 — `sql/migration_chat_comments.sql`

```sql
CREATE TABLE chat_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  scope VARCHAR(16) NOT NULL,                -- 'conversation' | 'session'
  conversation_id BIGINT UNSIGNED NULL,      -- scope=conversation일 때
  session_id BIGINT UNSIGNED NULL,           -- scope=session일 때
  author_id BIGINT UNSIGNED NOT NULL,        -- users.id (상담원)
  body TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_ccomment_tenant_conv (tenant_id, conversation_id),
  KEY idx_ccomment_tenant_sess (tenant_id, session_id)
);
```

- 하드 삭제(리포 기존 관례, SPEC §13). 엔티티는 nullable 컬럼에 명시 `type` 필수(union 타입 부팅 크래시 함정) — 작성 후 실부팅 확인.
- 내부 전용: 위젯/공개 API 어디에도 미노출. `@Public` 경로에 연결 금지.

### API (`/agent` 하위, `@RequireCapability(CONVERSATION_HANDLE)`)

- `GET /agent/conversations/:id/comments` → 대화방 코멘트 + 그 대화방이 속한 세션의 세션 코멘트(스코프 필드로 구분해 한 번에)
- `POST /agent/conversations/:id/comments` body `{ scope, body }` (session 스코프면 대화방의 session_id로 저장)
- `PATCH /agent/comments/:id` (작성자 본인만) / `DELETE /agent/comments/:id` (본인 또는 master)
- 전 쿼리 tenant 술어. 에러코드 신설: `E5053 COMMENT_NOT_FOUND`, `E5054 COMMENT_FORBIDDEN`(본인 아님).
- 응답 매퍼에 작성자 표시명 포함(users join).

### 와이어프레임 — 우측 레일 신규 카드

```
┌ 코멘트 ────────────────────────────┐
│ [대화방 2] [세션 1]   ← 스코프 탭     │
│ ┌────────────────────────────────┐ │
│ │ 김상담 · 8/24 14:03        ✎ 🗑 │ │
│ │ 반품 요청 고객. 사진 재요청함      │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ 이상담 · 8/23 11:20        ✎ 🗑 │ │
│ │ VIP — 응대 톤 주의               │ │
│ └────────────────────────────────┘ │
│ ┌──────────────────────┐          │
│ │ 코멘트 입력…            │  [등록]  │
│ └──────────────────────┘          │
└────────────────────────────────────┘
```

- 위치: 우측 레일(col-span-3), AI 브리핑 카드 아래.
- ✎/🗑는 본인 코멘트에만(🗑는 master에게 전체). 등록/수정/삭제 성공·실패 토스트(i18n, dev-kit §4.3).
- React Query 키에 tenantKey+conversationId 포함.

부수영향: 우측 레일 세로 공간 경쟁(브리핑/KB조회/이슈 카드 기존재) — 카드 접기(collapse) 기본 제공. 목록/상세 계약 무변경.

## S5. 브리핑 온디맨드 · 저장 · 번역 (R3)

### 스키마 — `sql/migration_conversation_briefings.sql`

```sql
CREATE TABLE conversation_briefings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  last_message_id BIGINT UNSIGNED NULL,      -- 생성 시점 커버 범위
  body TEXT NOT NULL,
  translations JSON NULL,                    -- { "ko": "...", "es": "..." }
  requested_by BIGINT UNSIGNED NOT NULL,     -- users.id
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_brief_tenant_conv (tenant_id, conversation_id, id)
);
```

### API 개편

- `GET /agent/conversations/:id/briefing` → **저장분 최신 1건 조회 전용**(LLM 미호출, 없으면 `briefing: null`). 기존 Redis 캐시 경로 제거.
- `POST /agent/conversations/:id/briefing` → LLM 생성(기존 `buildBriefing` 재사용, 최근 50메시지·ASSIST) + 행 저장 + 반환. 실패는 삼키지 않고 `E5055 BRIEFING_FAILED`(502 계열) 표면화.
- `POST /agent/briefings/:id/translate` body `{ lang }` (시스템 6종 검증) → 저장분 있으면 즉시 반환, 없으면 LLM 번역(ASSIST, "translate to {lang}" 프롬프트) 후 `translations[lang]` 갱신·반환.
- 프런트 `useBriefing` — 자동 fetch를 저장분 GET으로 대체(LLM 비용 0), 생성/번역은 mutation.

### 와이어프레임 — AI 브리핑 카드 (개편)

```
┌ ✦ AI 브리핑 ───────────────────────┐
│ (저장된 브리핑 없음)                  │
│              [브리핑 생성]           │
├─ 생성 후 ──────────────────────────┤
│ 요약: 배송 지연 문의… 의도: 환불 …    │
│ 생성 8/24 14:02 · 김상담  [재생성]    │
│ ┌ 번역 ────────────────────────┐   │
│ │ 대상 [한국어 ▾]        [번역]   │   │
│ │ (번역 결과 표시 영역)           │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

- 언어 셀렉트는 `@ivy/types` language 소스에서 endonym으로(딥임포트 규칙 준수, 재나열 금지). 기본 선택 = 콘솔 UI 언어.
- 재생성 = POST 재호출(새 행, 이력은 DB 보존; UI는 최신본만 표시 — 이력 UI는 범위 밖).
- 생성/번역 중 스피너, 실패 토스트(수동 닫기).

부수영향: 대화 열람 시 LLM 자동 호출이 사라짐 → **토큰 사용량 감소**, 단 "열면 바로 요약이 있던" 기존 체감은 버튼 1회로 대체(요구사항이 명시적으로 이를 지시). `assist` 토큰 예산(512)은 번역에도 공유 — 브리핑 길이상 충분. Redis 캐시 제거로 관련 코드 단순화.

---

## 마이그레이션·배포 (MUST)

- 신규 SQL 2종: `migration_chat_comments.sql`, `migration_conversation_briefings.sql` → `npm run migrations:manifest` 갱신.
- 순서: 스테이징 MySQL(`ivy_mysql_staging`)에 SQL 선적용 → 코드 배포(구코드+신컬럼 안전). `pre-deploy-check` 스킬로 검증.
- PR 본문에 `## Migration` 섹션(경로·환경별 체크박스·롤백: `DROP TABLE` 2건).
- 배포 검증: 부팅 로그 + 신규 라우트 401/404 판별 + 엔티티 추가 후 실부팅(union 타입 크래시 함정).

## 테스트 계획 개요 (TCR에서 상세화)

- 유닛: agent-alert 테넌시 4케이스(S1) · comment service CRUD+권한(S4) · briefing 저장/번역 저장분 재사용(S5) · file-type doc/xls 매직 판별(S3).
- 수동: 목록 줄바꿈 6언어 렌더(S2), 2테넌트 동시 로그인 호출 모달 격리(S1), doc/xls 실파일 왕복(S3), 코멘트 세션 스코프가 후속 대화방에서 보이는지(S4), 브리핑 생성→번역→재진입 시 저장분 표시(S5).

## i18n

신규 키(콘솔 livechat 네임스페이스): 상태 라벨 2, 코멘트 카드 ~10, 브리핑 버튼/번역 패널 ~8 × 6개 언어. `npm run i18n:check` 통과 필수.

## 범위 밖 (기록만)

- 상세 헤더 1행 정리(R1의 목록 외 영역), 브리핑 이력 열람 UI, E5041 미사용 정리, 콘솔 업로드 pending 쿼터, 서명 URL 15분 만료 갱신, 드래그앤드롭/붙여넣기 첨부.

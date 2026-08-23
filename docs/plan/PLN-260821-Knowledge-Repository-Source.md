# PLN-260821-Knowledge-Repository-Source

지식 소스 GitHub 리포지터리 연동 (S3) — 구현 계획

- 근거: `docs/analysis/REQ-260821-Knowledge-Repository-Source.md`
- 원칙: notion/gdrive 어댑터 세트 미러링, SDK 없이 fetch, **스키마 변경 없음**, 공유 파이프라인 무수정.
- **개정 2026-08-24** — 사이드임팩트를 `main`(`5be7229`) 실코드에 대조해 §3을 재작성했습니다.
  신규 5건(깨지는 기존 테스트 2건, 동기화 버튼 활성화, 자격증명 선행검사, 엔티티 드리프트),
  완화 1건(자동 스케줄러 부재), 정정 1건(콘솔 드롭다운은 이미 존재). §1·§2에 반영했습니다.
  이어서 **출하된 노션 구현(PR #331)과 대조**해 본문 처리 규칙 4건(D11·D12·dropped 하한·
  사유별 집계)이 누락돼 있던 것을 채웠습니다 — 대조표는 §5.

## 0. 설계 결정

| # | 결정 | 근거 |
|---|------|------|
| **D1** | 인증 = **PAT 필수**. 클래식(`ghp_`)·파인그레인드(`github_pat_`) 둘 다 수용, 콘솔은 **파인그레인드 + Contents:Read-only** 안내 | 둘 다 `Authorization: Bearer`라 코드는 동일. 비인증은 60회/시간이고 **서버 IP 단위 공유**라 실사용 불가 |
| **D2** | 대상 = `owner/repo` + 선택 `ref`(미지정 = 기본 브랜치) + 선택 `path` **접두사** | 글롭은 표현력 대비 오해 소지가 큼. `docs/`면 충분 |
| **D3** | **재귀 전체 트리** — gdrive·notion의 flat 원칙을 깨는 유일한 지점 | `git/trees?recursive=1`이 **1요청**으로 전체를 줌(실측 589엔트리). 재귀가 오히려 쌈 |
| **D4** | 확장자 `.md`/`.markdown`/`.mdx`/`.txt`만 | 코드 파일은 KB를 오염시킴 |
| **D5** | 파일 크기 상한 **1 MB** 초과 스킵 | 실측 `CHANGELOG.md` 205 KB. 임베딩 입력은 어차피 30,000자 |
| **D6** | 1회 파일 수 상한 **300** | 노션 200과 같은 이유. GitHub 예산(5,000/hr)이 넉넉해 더 큼 |
| **D7** | 제목 = 본문 첫 `# 제목`, 없으면 파일명 | 검색·인용 품질 |
| **D8** | `externalKey = file:{path}` | 경로가 안정 키. 파일 이동 = 신규+숨김 |
| **D9** | `trustEmptyListing = false` | GitHub도 **없는 레포와 권한 없는 레포를 똑같이 404**로 답함 |
| **D10** | 원본 삭제 = 숨김 | 기존 파이프라인 규칙 |
| **D11** | 본문 상한 **30,000자** 초과는 잘라 저장하고 그 문서를 `truncated`로 **계수** | 노션과 동일 상수(`MAX_CONTENT_CHARS`). D5(1MB 스킵)와 다른 층위 — 1MB 미만이면서 30,000자를 넘는 파일이 실재함(REQ §1.3 실측 `CHANGELOG.md` 205KB ≈ 20만 자). 상한이 없으면 임베딩 입력에서 조용히 잘림 |
| **D12** | **빈 파일은 문서로 만들지 않고 `dropped`에도 넣지 않음** | 노션의 `empty` 처리와 동일. 검색할 내용이 없는 문서는 색인을 나쁘게 하고 임베딩 1콜을 낭비함. 보류한 일이 아니므로 `dropped`에 넣으면 정상 동기화가 잘린 것처럼 보임 |

```
자격증명: integration_credentials(provider='github') — PAT AES-256-GCM
소스 config_json: { owner, repo, ref?, path? }
수집: 트리 1요청(재귀) → 확장자·경로·크기 필터 → 파일당 본문 1요청 → SourceItem
가드: trustEmptyListing=false · 트리 truncated → dropped 하한 · 파일 300/1MB 상한 보고
      본문 30,000자 절단 시 truncated 계수 · 빈 파일 스킵 · 컬럼 상한 절단
```

## 1. 단계별 계획

### W1 — 백엔드 (PR 1)

- `github.util.ts` (**단위 테스트**): `parseRepoTarget()` — `owner/repo`, `https://github.com/owner/repo`,
  `.../tree/{ref}/{path}`, `git@github.com:owner/repo.git` 4형태에서 좌표 추출; `validateGithubToken()` —
  `ghp_`/`github_pat_`/기타 수용하되 URL·공백·과단축 거부
- `github.client.ts` (fetch 전용): 공통 래퍼(`Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`),
  **레이트리밋 헤더 존중**(`x-ratelimit-remaining` 0이면 즉시 중단 + 리셋 시각 안내), 30초 타임아웃,
  403 secondary-rate-limit은 `Retry-After` 1회, 오류는 GitHub 메시지 200자 전달
  (`GithubAuthError`/`GithubRequestError{status,code}`)
  - `me()`, `repo(owner,name)`, `tree(owner,name,ref)`(재귀 1요청, `truncated` 반환),
    `fileText(owner,name,path,ref)`(`Accept: application/vnd.github.raw`)
- `github-credential.service.ts`: 노션 서비스와 동형 — save(암호화·**감사기록**)/load/status(끝 4자 마스킹)/
  remove(감사기록)/`test(target?)` — 토큰 무효(401)와 레포 미접근(404)을 **구분 메시지**로
- `adapters/repository.adapter.ts`: `type='repository'`, `trustEmptyListing=false`,
  `credential={provider:'github', label:'GitHub personal access token'}`, `validateConfig`,
  `fetchAll()` → `SourceItem[]`(externalKey `file:{path}`, title 255절단, sourceUrl `blob/{ref}/{path}` 512절단,
  category=소스명 64절단) + `{dropped, truncated}`
  - **본문 30,000자 절단 + 해당 문서 `truncated` 계수**(D11) — 노션 어댑터와 같은 의미로 셈:
    "부분만 담긴 저장 문서 수"이지 "일찍 멈춘 파일 수"가 아님
  - **빈 파일 스킵**(D12) — `dropped`에 넣지 않음
  - **트리가 `truncated`면 `dropped`는 총량이 아니라 하한**(노션 `listing.hasMore` 처리와 동형).
    전체 목록을 못 본 상태라 정확한 누락 수를 셀 수 없음 → 최소 1로 보고
  - **사유별 집계 로깅** — 확장자 제외·1MB 초과·빈 파일·경로 미일치를 각각 세어 한 줄로
    (노션 `skippedTypes`와 동형). 합계만 남기면 왜 적게 들어왔는지 운영자가 알 수 없음
- 배선: `INTEGRATION_PROVIDER.GITHUB`(packages/types), DTO 2종, 모듈 등록,
  컨트롤러 `github/credential`(GET/PUT/DELETE)+`github/test` — 노션 4라우트와 동일 capability
  — ⚠️ `KNOWLEDGE_SOURCE_TYPE.REPOSITORY`(`enum.types.ts:309`)와 DTO `@IsIn`은 **이미 존재**, 수정 불필요
- **G6 — 설정 오류를 400으로**: 어댑터 설정 오류를 `BusinessException(VALIDATION_FAILED, 400)`으로.
  현재 `gdrive.adapter.ts:50,53`·`notion.adapter.ts:72,75,78`이 평범한 `Error`를 던져 500
  "Internal server error"가 되고 이유가 가려짐. **세 어댑터 동시 정정**
- **기존 테스트 갱신(신규 식별)**: `source-sync.service.spec.ts:223`의
  `supportedTypes()` → `['board','gdrive','notion','repository']`,
  `:219`의 "repository는 어댑터가 없어 throw" 케이스를 **"설정이 없어 400"**으로 재작성
- 신규 테스트: util(좌표 4형태·토큰 4종), client(헤더·레이트리밋 중단·타임아웃·404/401 구분·raw accept),
  adapter(필터·재귀·상한·절단·제목추출·빈 목록), credential(test 구분·감사기록)

### W2 — 콘솔 UI (PR 1에 포함)

- `KnowledgePage.tsx`: **드롭다운에 `repository`는 이미 있음**(`:60`) — 추가가 아니라 **모달 분기**를 만드는 일.
  대상 입력(URL 붙여넣기 자동 파싱) + 브랜치·경로(선택) + 파인그레인드 PAT 권한 콜아웃 + 토큰 미등록 안내
- `SourceCredentialCard` **3회째 재사용**(추가 추상화 없음). 카드 그리드 `md:grid-cols-2` → `lg:grid-cols-3`(`:526`)
- 서비스·훅 4종(`['knowledge', tenantKey, 'github-credential']`)
- i18n: `knowledge` 네임스페이스 **6개 언어 × 153키** 유지 — 신규 키를 6종 모두에 넣고 `npm run i18n:check`.
  ⚠️ vi/ja/zh는 LLM 초벌(β) 상태이므로 신규 문구도 **검수 대기 목록에 추가**([[i18n-six-languages]])

### W3 — 배포·검증 + 문서 (PR 2 = docs)

- 스테이징 배포(**스키마 변경 없음** → SQL 사전적용 불필요, PR에 Migration "해당 없음" 명기)
- 배포 검증 3종(부팅 로그·컨테이너 age·신규 라우트 401)
- 실 GitHub API 검증(토큰 없이 가능한 범위): 공개 레포 트리·404·레이트리밋 헤더
- 컨테이너 내부 실 DB 시나리오(PAT 암호화 왕복·오붙여넣기 거부·사전검증)
- ⚠️ **실 PAT E2E는 사용자 의존(C5)** — 미수령 시 TCR에 '대기'로 명시
- **배포 직후 운영 안내**(§3 S1) 발송 → TCR-260821 + RPT-260821 + 메모리 갱신

## 2. UI 와이어프레임 (필수)

```
/knowledge  자격증명 카드 영역 (2장 → 3장, md:grid-cols-2 → lg:grid-cols-3)
┌──────────────────────────────────────────────────────────────┐
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐        │
│ │ Google Drive  │ │ Notion        │ │ GitHub        │        │
│ │ 연결됨         │ │ 미등록         │ │ 미등록         │        │
│ │ sa@…iam…      │ │ 토큰 [ntn_…]  │ │ 토큰 [ghp_…]  │        │
│ │ [테스트][삭제] │ │ [등록][테스트] │ │ [등록][테스트] │        │
│ └───────────────┘ └───────────────┘ └───────────────┘        │
└──────────────────────────────────────────────────────────────┘

소스 추가 모달 (유형=repository — 드롭다운 값은 이미 존재, 분기 화면이 신규)
┌────────────────────────────────────────────────┐
│ 이름   [Hotel Admin 사용 가이드          ]      │
│ 유형   (repository ▼)                          │
│ 레포   [https://github.com/acme/docs      ]    │
│        └ URL을 붙여넣으면 owner/repo만 저장     │
│ 브랜치 [            ] 비우면 기본 브랜치        │
│ 경로   [docs/       ] 비우면 레포 전체          │
│ ⓘ 파인그레인드 PAT이라면 이 레포를 대상에       │
│   포함하고 Contents: Read 권한을 주십시오.      │
│ (토큰 미등록 시) ⚠ 먼저 GitHub 토큰을 등록      │
│    └ 등록 전 [등록] 누르면 400으로 거부됨       │
│                        [취소]  [등록]           │
└────────────────────────────────────────────────┘

소스 목록 행 — 어댑터 등록 전후
  전: [repository] Hướng dẫn…   준비중    [동기화]  ← disabled
  후: [repository] Hướng dẫn…   실패      [동기화]  ← 활성, 누르면 사유 토스트
```

## 3. 사이드 임팩트 (2026-08-24 실측 재작성)

각 항목은 `main`(`5be7229`) 코드에서 확인했고 파일·행을 근거로 답니다.

### S1. 스테이징 기존 소스 2건 — 상태가 바뀌고 **버튼이 열립니다** ⚠️ 신규

```
knowledge_sources
  2  tenant 1  gdrive      policy                        config_json=NULL
  5  tenant 4  repository  Hướng dẫn sử dụng Hotel Admin  config_json=NULL
```

`supported` 플래그는 `supportedTypes()`(`source-sync.service.ts:74`)가 정하고
`knowledge.mapper.ts:56`이 행마다 붙입니다. 어댑터를 등록하면 id=5가 `supported:false → true`가 되어

- 표시가 "준비중" → **실패**로 바뀌고(의도된 변화 — 실제로 설정이 없음),
- **동기화 버튼이 `disabled`에서 활성으로 바뀝니다**(`KnowledgePage.tsx:395-396`). 8/21 계획서에 없던 항목입니다.

go2joy(tenant 4) 운영자가 직접 등록한 행이므로, 눌렀을 때 이유가 보여야 합니다 → **G6이 이 항목의 전제 조건**입니다.
배포 직후 해당 테넌트에 안내가 필요합니다(W3).

### S2. 기존 테스트 2건이 깨집니다 ⚠️ 신규

| 위치 | 현재 단언 | 조치 |
|---|---|---|
| `source-sync.service.spec.ts:223` | `supportedTypes()` = `['board','gdrive','notion']` | `'repository'` 추가 |
| `source-sync.service.spec.ts:219` | `type:'repository'` 동기화는 **어댑터 부재로 throw** | 사유가 바뀌므로(설정 없음 → 400) 케이스 재작성 |

계획에 없으면 CI에서 처음 발견됩니다. W1 작업 항목에 포함했습니다.

### S3. 자격증명 선행검사가 **신규 생성만** 막습니다 ⚠️ 신규

`knowledge.service.ts:95-104`가 `adapter.credential` 선언을 보고 소스 생성 시점에 자격증명 존재를 요구합니다.
어댑터 등록 후에는 **GitHub 토큰 없이 repository 소스를 만들 수 없습니다**(400 + "Register the … before adding this source").
단 이 검사는 생성 경로에만 있으므로 **이미 저장된 id=5 행은 그대로 남습니다** — S1이 성립하는 이유입니다.

### S4. 자동 동기화 스케줄러가 없습니다 — 레이트리밋 위험 완화 ✅ 신규(완화)

`domain/knowledge` 전체에 소스 동기화를 도는 `@Cron`/`setInterval`이 없습니다
(`knowledge-gap.service.ts`의 배치는 지식 갭 분석이며 소스 수집과 무관).
동기화는 **사람이 누를 때만** 실행되므로, 잘못 설정된 소스가 백그라운드에서 GitHub를 반복 호출할 경로가 없습니다.
8/21 리스크 R2의 심각도를 낮춥니다.

### S5. 제공자 열거에 파급이 없습니다 ✅ 확인

`INTEGRATION_PROVIDER`에 `GITHUB`를 더해도 설정 페이지는 영향받지 않습니다.
`INTEGRATION_FIELDS`는 `Record<GenericIntegrationProvider, …>`(전수 타입)이지만 그 유니온은
ecommerce/marketing/helpdesk 3그룹으로 한정되고, **`google_drive`·`notion`이 이미 같은 방식으로 빠져 있습니다**
(`apps/web/src/domain/settings/integration-providers.ts:17,33`). GitHub도 지식 소스 자격증명이지 커머스 연동이 아닙니다.

`integration_credentials`는 `@Unique('uk_cred_tenant_provider', ['tenantId','provider'])` —
**테넌트당 GitHub 토큰 1개**로 D1과 일치합니다. `provider varchar(32)`에 `'github'`는 여유롭습니다.

### S6. 엔티티 드리프트 — 선재 결함, PAT엔 무해 ⚠️ 신규(범위 밖)

`integration-credential.entity.ts:17`은 `secret_enc`를 `varbinary(2048)`로 선언하는데,
`sql/migration_gdrive_credential.sql:21`이 스테이징 컬럼을 **4096으로 확장**해 두었습니다. 엔티티만 옛 값입니다.
개발 환경은 `DB_SYNCHRONIZE=true`(`env/backend/.env.development:12`)라 마이그레이션이 적용된 DB에 붙으면
TypeORM이 **컬럼을 2048로 되돌리려 시도**합니다.

PAT은 100자 미만이라 S3에는 아무 영향이 없습니다. **이 PR의 범위 밖**으로 두되, 자격증명 코드를 만지는 김에
엔티티를 4096으로 맞추는 1줄 수정을 별건으로 제안합니다(gdrive 키가 영향권).

### S7. 공유 파이프라인 — 무수정 ✅ 확인

`SourceFetch{items,dropped,truncated}` 계약이 이미 있고(`source-adapter.interface.ts:31`),
`source-sync.service.ts:107-117`이 배열/객체 양쪽을 받습니다. `guardedEmpty`면
`recordSyncState(…, 'failed')`(`knowledge.service.ts:694`)로 기록되는 경로도 그대로 씁니다.
어댑터를 `Map`에 등록하는 방식(`:69-70`)이라 등록 외 수정이 없습니다.

### S8. 요약표

| 영역 | 영향 | 대응 |
|---|---|---|
| 스테이징 소스 id=5 | 준비중 → 실패, **동기화 버튼 활성화** | G6 + 운영 안내 (S1) |
| 기존 테스트 2건 | 깨짐 | W1에 갱신 포함 (S2) |
| 소스 생성 경로 | GitHub 토큰 없으면 400 | 의도됨, 모달에 사전 안내 (S3) |
| 백그라운드 호출 | 없음 | 스케줄러 부재 (S4) |
| 설정 페이지·제공자 열거 | 없음 | 선례로 확인 (S5) |
| notion/gdrive 어댑터 | G6으로 예외 타입 변경 | 메시지 동일, 500→400. 회귀 확인 |
| 자격증명 카드 | 2장 → 3장 | `lg:grid-cols-3`, 좁은 화면 회귀 확인 |
| i18n | 신규 키 × 6언어 | `i18n:check` 통과 + vi/ja/zh 검수 대기 등록 |
| DB 스키마 | 변경 없음 | PR Migration "해당 없음" |
| `secret_enc` 엔티티 | 선재 드리프트 | 범위 밖, 별건 제안 (S6) |

## 4. 리스크

- **R1.** 대형 레포에서 트리 `truncated` → 조용한 부분 수집. **`truncated`를 결과에 보고**하고
  `dropped`는 하한으로 취급(무음 금지). 노션이 `hasMore`에서 같은 판단을 이미 함.
- **R2.** `.md`가 수백 개인 레포 → 상한 300 + 경로 접두사 안내. **S4로 심각도 하향**(수동 실행뿐).
- **R3.** 실 PAT E2E 지연(C5) → 모킹 + 비인증 공개 레포 실측으로 선배포.
- **R4.** 파인그레인드 PAT의 레포 미포함이 **404**로 나타나 "없는 레포"와 구분 불가 →
  테스트 메시지에 두 원인을 함께 안내.
- **R5.** G6이 세 어댑터를 동시에 건드립니다. 메시지는 그대로 두고 **상태코드만** 바꾸며,
  gdrive·notion 기존 스펙으로 회귀를 확인합니다.

## 5. 노션 구현(PR #331) 대조

이 계획이 "노션 세트 미러링"이라고 말하는 이상, 출하된 노션 코드의 각 판단이 GitHub판에서
어떻게 되는지 명시합니다. **반영/불필요를 적지 않으면 누락과 의도적 생략을 구분할 수 없습니다.**

| 노션 구현 | 위치 | GitHub판 |
|---|---|---|
| `MAX_PAGES_PER_SYNC = 200` | `notion.adapter.ts:26` | **반영** — D6 파일 300(예산이 5,000/hr로 넉넉) |
| `MAX_CONTENT_CHARS = 30_000` | `notion-block-text.util.ts:44` | **반영(D11, 이번에 추가)** — 같은 상수. 205KB 파일이 실재 |
| 빈 항목 스킵, `dropped` 제외 | `notion.adapter.ts:105-110` | **반영(D12, 이번에 추가)** |
| `hasMore` → `dropped`를 하한 처리 | `notion.adapter.ts:98` | **반영(이번에 추가)** — 트리 `truncated`가 같은 상황 |
| `skippedTypes` 사유별 집계 로깅 | `notion.adapter.ts:112-135` | **반영(이번에 추가)** — 확장자·크기·빈파일·경로 |
| `truncated` = "부분만 담긴 저장 문서 수" | `notion.adapter.ts:117-119` | **반영** — 의미까지 동일하게 |
| 30초 타임아웃 / `Retry-After` 상한 30초 | `notion.client.ts:45,48` | **반영** — W1 클라이언트 |
| 버전 헤더 고정 | `NOTION_VERSION` `:21` | **반영** — `X-GitHub-Api-Version: 2022-11-28` |
| 404 전용 코드 구분 | `NOT_FOUND_CODE` `:77` | **반영** — 401/404 구분 메시지(R4) |
| 255/512/64 컬럼 절단 | `notion.adapter.ts:120-125` | **반영** |
| `trustEmptyListing=false` + 사유 주석 | `notion.adapter.ts:44` | **반영(D9)** — GitHub은 404가 그 자리 |
| `credential={provider,label}` 선언 | `notion.adapter.ts:48` | **반영** — 생성 시 선행검사(S3)를 그대로 물려받음 |
| 콘솔 쿼리키·서비스 4종·토스트 | `knowledge.hooks.ts:99-129` | **반영** — `'github-credential'`로 동형 |
| `LIST_CEILING = 1000` (목록 페이지네이션 상한) | `notion.client.ts:31` | **불필요** — 트리는 재귀 1요청이라 페이지네이션 자체가 없음 |
| `MAX_REQUESTS_PER_PAGE = 30` (항목당 요청 예산) | `notion.client.ts:42` | **불필요** — 파일당 정확히 1요청. D6 파일 상한이 그 역할 |
| `MAX_BLOCK_DEPTH = 3` (깊이 제한) | `notion-block-text.util.ts:41` | **불필요** — 블록 트리가 없음. 단 **디렉터리 재귀는 제한하지 않음**(D3, 트리가 1요청이므로 깊이가 비용이 아님) |
| `blocksToText` 변환기 | `notion-block-text.util.ts` | **불필요** — Markdown·텍스트는 이미 텍스트. 노션 대비 340 LOC 절감 |

---
**승인 요청**: 승인 시 W1부터 착수합니다. 실 검증을 위해 **PAT**(Contents:Read)과 대상 레포를 주시면
W3에서 끝까지 확인하고, 없으면 해당 항목만 '대기'로 남깁니다(gdrive·notion과 동일한 상태가 됨).

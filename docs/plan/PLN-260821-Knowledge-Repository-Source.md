# PLN-260821-Knowledge-Repository-Source

지식 소스 GitHub 리포지터리 연동 (S3) — 구현 계획

- 근거: `docs/analysis/REQ-260821-Knowledge-Repository-Source.md`
- 원칙: notion/gdrive 어댑터 세트 미러링, SDK 없이 fetch, **스키마 변경 없음**, 공유 파이프라인 무수정.

## 0. 설계 결정

| # | 결정 | 근거 |
|---|------|------|
| **D1** | 인증 = **PAT 필수**. 클래식(`ghp_`)·파인그레인드(`github_pat_`) 둘 다 수용, 콘솔은 **파인그레인드 + Contents:Read-only** 안내 | 둘 다 `Authorization: Bearer`라 코드는 동일. 비인증은 60회/시간이고 **서버 IP 단위 공유**라 실사용 불가 |
| **D2** | 대상 = `owner/repo` + 선택 `ref`(미지정 = 기본 브랜치) + 선택 `path` **접두사** | 글롭은 표현력 대비 오해 소지가 큼. `docs/`면 충분 |
| **D3** | **재귀 전체 트리** — gdrive·notion의 flat 원칙을 깨는 유일한 지점 | `git/trees?recursive=1`이 **1요청**으로 전체를 줌(실측 589엔트리). 재귀가 오히려 쌈. 문서 폴더는 본질적으로 트리 |
| **D4** | 확장자 `.md`/`.markdown`/`.mdx`/`.txt`만 | 코드 파일은 KB를 오염시킴. gdrive의 "텍스트를 가진 형식만" 원칙 계승 |
| **D5** | 파일 크기 상한 **1 MB** 초과 스킵 | 실측 `CHANGELOG.md` 205 KB. 임베딩 입력은 어차피 30,000자 |
| **D6** | 1회 파일 수 상한 **300** | 노션 200과 같은 이유. GitHub 예산(5,000/hr)이 넉넉해 더 큼 |
| **D7** | 제목 = 본문 첫 `# 제목`, 없으면 파일명 | 파일명(`shipping-policy.md`)보다 제목이 검색·인용에 낫다 |
| **D8** | `externalKey = file:{path}` | 경로가 안정 키. 파일 이동 = 신규+숨김(정확한 동작) |
| **D9** | `trustEmptyListing = false` | GitHub도 **없는 레포와 권한 없는 레포를 똑같이 404**로 답함 |
| **D10** | 원본 삭제 = 숨김 | 기존 파이프라인 규칙 |

```
자격증명: integration_credentials(provider='github') — PAT AES-256-GCM
소스 config_json: { owner, repo, ref?, path? }
수집: 트리 1요청(재귀) → 확장자·경로·크기 필터 → 파일당 본문 1요청 → SourceItem
가드: trustEmptyListing=false · 트리 truncated 보고 · 파일 300/1MB 상한 보고 · 컬럼 상한 절단
```

## 1. 단계별 계획

### W1 — 백엔드 (PR 1)
- `github.util.ts` (**단위 테스트**): `parseRepoTarget()` — `owner/repo`, `https://github.com/owner/repo`,
  `.../tree/{ref}/{path}`, `git@github.com:owner/repo.git`에서 좌표 추출; `validateGithubToken()` —
  `ghp_`/`github_pat_`/기타 수용하되 URL·공백·과단축 거부(노션 토큰 검증과 동형)
- `github.client.ts` (fetch 전용): 공통 래퍼(`Authorization: Bearer`, `X-GitHub-Api-Version: 2022-11-28`,
  `Accept`), **레이트리밋 헤더 존중**(`x-ratelimit-remaining` 0이면 즉시 중단 + 리셋 시각 안내),
  30초 타임아웃, 403 secondary-rate-limit은 `Retry-After` 1회(노션 클라이언트와 동일 상한 30초),
  오류는 GitHub 메시지 200자 전달(`GithubAuthError`/`GithubRequestError{status,code}`)
  - `me()` (`GET /user` — 토큰 검증), `repo(owner,name)` (기본 브랜치·private 여부),
    `tree(owner,name,ref)` (재귀 1요청, `truncated` 반환), `fileText(owner,name,path,ref)`
    (`Accept: application/vnd.github.raw`)
- `github-credential.service.ts`: 노션 서비스와 동형 — save(암호화·**감사기록**)/load/status(마스킹 끝 4자)/
  remove(감사기록)/`test(target?)` — 토큰 무효(401)와 레포 미접근(404)을 **구분 메시지**로
- `adapters/repository.adapter.ts`: `type='repository'`, `trustEmptyListing=false`,
  `credential={provider:'github', label:'GitHub personal access token'}`,
  `validateConfig`(좌표 필수·형식 검증), `fetchAll()` — 트리 → 필터 → 본문 →
  `SourceItem[]`(externalKey `file:{path}`, title=첫 헤딩·255절단, sourceUrl=`blob/{ref}/{path}`·512절단,
  category=소스명·64절단) + `{dropped, truncated}`
- 배선: `INTEGRATION_PROVIDER.GITHUB`(packages/types), DTO `SaveGithubCredentialRequest`/`TestGithubRequest`,
  모듈 등록, 컨트롤러 `github/credential`(GET/PUT/DELETE)+`github/test` 4라우트(동일 capability)
  — ⚠️ `KNOWLEDGE_SOURCE_TYPE`·DTO `@IsIn`은 **이미 'repository'를 포함**하므로 수정 불필요
- **G6 — 설정 오류를 400으로**: 어댑터가 던지는 설정 오류(`config_json` 없음 등)를
  `BusinessException(VALIDATION_FAILED, 400)`로 바꿔 이유가 토스트에 닿게 함.
  현재는 평범한 `Error` → 500 "Internal server error"로 이유가 가려짐. **notion·gdrive 어댑터도 함께 정정**
- 테스트: util(좌표 4형태·토큰 4종), client(헤더·레이트리밋 중단·타임아웃·404/401 구분·raw accept),
  adapter(필터·재귀·상한·절단·제목추출·빈 목록), credential(test 구분·감사기록)

### W2 — 콘솔 UI (PR 1에 포함)
- `KnowledgePage.tsx`: 모달 `repository` 분기 — 대상 입력(URL 붙여넣기 자동 파싱) + 브랜치·경로(선택)
  + "파인그레인드 PAT에 이 레포와 Contents:Read를 주었는지" 콜아웃 + 토큰 미등록 안내
- `SourceCredentialCard` **3회째 재사용**(추가 추상화 없음 — 이미 맞는 모양임이 확인됨)
- 서비스·훅 4종(`['knowledge', tenantKey, 'github-credential']`), i18n **6개 언어** + `i18n:check`

### W3 — 배포·검증 + 문서 (PR 2 = docs)
- 스테이징 배포(스키마 변경 없음), 배포 검증 3종
- **실 GitHub API 검증**(토큰 없이 가능한 범위): 공개 레포 트리·404·레이트리밋 헤더 —
  이미 REQ §1.3에서 일부 실측 완료
- 컨테이너 내부 실 DB 시나리오(PAT 암호화 왕복·오붙여넣기 거부·사전검증)
- ⚠️ **실 PAT E2E는 사용자 의존(C5)** — 미수령 시 TCR에 '대기'로 명시
- TCR-260821 + RPT-260821, 메모리 갱신

## 2. UI 와이어프레임 (필수)

```
/knowledge  자격증명 카드 영역 (3장으로 확장 — md:grid-cols-2 → lg:grid-cols-3)
┌──────────────────────────────────────────────────────────────┐
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐        │
│ │ Google Drive  │ │ Notion        │ │ GitHub        │        │
│ │ 연결됨         │ │ 미등록         │ │ 미등록         │        │
│ │ sa@…iam…      │ │ 토큰 [ntn_…]  │ │ 토큰 [ghp_…]  │        │
│ │ [테스트][삭제] │ │ [등록][테스트] │ │ [등록][테스트] │        │
│ └───────────────┘ └───────────────┘ └───────────────┘        │
└──────────────────────────────────────────────────────────────┘

소스 추가 모달 (유형=repository 선택 시)
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
│                        [취소]  [등록]           │
└────────────────────────────────────────────────┘
```

## 3. 사이드 임팩트 분석

| 영역 | 영향 | 대응 |
|------|------|------|
| **스테이징 기존 소스 2건** | `repository` 어댑터가 생기면 tenant 4의 id=5(그리고 gdrive id=2)가 "준비중" → **"실패"**로 바뀜 | 의도된 변화(실제로 설정이 없음). G6으로 이유가 토스트에 보이게 하고, RPT에 운영 안내 기재 |
| notion/gdrive 어댑터 | G6으로 설정 오류 예외 타입 변경 | 메시지 동일, 상태코드만 500→400. 기존 스펙으로 회귀 확인 |
| 공유 sync 파이프라인 | **무수정** | `{items,dropped,truncated}` 계약을 그대로 사용 |
| 자격증명 카드 | 2장 → 3장 그리드 | `lg:grid-cols-3`, 좁은 화면 회귀 확인 |
| DB 스키마 | 변경 없음 | PR에 Migration "해당 없음" 명기 |
| 레이트리밋 | 파일당 1요청 | 상한 300 + 잔량 헤더 존중 + 결과에 드롭 수 기록 |

## 4. 리스크

- R1. 대형 레포에서 트리 `truncated` → 조용한 부분 수집. **`truncated`를 결과에 보고**(무음 금지).
- R2. `.md`가 수백 개인 레포(예: CHANGELOG·번역본) → 상한 300 + 경로 접두사 안내로 완화.
- R3. 실 PAT E2E 지연(C5) → 모킹 + 비인증 공개 레포 실측으로 선배포.
- R4. 파인그레인드 PAT의 레포 미포함은 **404**로 나타나 "없는 레포"와 구분 불가 →
  테스트 메시지에 두 원인을 함께 안내(노션 Connections 안내와 같은 방식).

---
**승인 요청**: 승인 시 W1부터 착수합니다. 실 워크스페이스 검증을 위해 **PAT**(Contents:Read)과
대상 레포를 주시면 W3에서 끝까지 확인하고, 없으면 해당 항목만 '대기'로 남깁니다.

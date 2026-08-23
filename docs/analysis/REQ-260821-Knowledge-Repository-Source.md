# REQ-260821-Knowledge-Repository-Source

지식 소스 GitHub 리포지터리 연동 (S3) — 요구사항 분석

> ⚠️ **제외 결정 (2026-08-24)** — 지식 소스에서 GitHub를 **제외**하기로 했습니다.
> 이 문서는 그때의 분석 기록으로만 남습니다. 구현하지 않으며, 미착수 백로그가 아닙니다.
> 콘솔 소스 유형 드롭다운에서도 `repository`를 제거했습니다(PR 참조).
> 되살릴 경우 이 REQ부터 재검토하십시오 — 계획서 개정본(PR #335)은 머지하지 않고 닫았습니다.


- 요청일: 2026-08-21
- 요청 요지: 지식 소스 3종 중 마지막으로 남은 `repository` 타입을 실제로 동작시킨다.
- 선행: `REQ-260804-Knowledge-ProductGroup-SourceIngestion` 요구 ② / `PLN-260804-Knowledge-Source-Ingestion` §7
  (S3는 "자격증명 확보 후"로 **설계가 통째로 유보**돼 있었음 — 인증·대상지정·경로·파일형식 모두 미결정)

## 1. AS-IS

### 1.1 이미 있는 것 — 어댑터 하나면 되는 상태

S1(board)·S2(gdrive)·S4(notion)를 거치며 공유 파이프라인이 완성돼 있습니다. 새 소스 타입은
`SourceAdapter` 하나 — `type` / `trustEmptyListing` / `credential` / `validateConfig()` / `fetchAll()` —
만 구현하면 업서트·무변경 건너뜀·미색인 재색인·숨김·배치 임베딩·이력·빈 목록 가드를 전부 물려받습니다.
자격증명도 `integration_credentials`(AES-256-GCM) + 콘솔의 `SourceCredentialCard`를 그대로 씁니다.

`fetchAll`은 `SourceItem[]` 또는 `{items, dropped, truncated}`를 돌려줄 수 있습니다(S4에서 추가).

### 1.2 `repository`의 현재 상태 — 등록되지만 아무 일도 안 함

`KNOWLEDGE_SOURCE_TYPE.REPOSITORY`와 DTO `@IsIn`에 값은 있고, **GitHub 호출 코드는 0건**입니다
(`octokit`/`api.github.com` 참조 없음). 콘솔은 어댑터가 없으므로 "준비중"으로 표시합니다.

**스테이징 실측 — 기다리고 있는 테넌트가 실재합니다.**

```
knowledge_sources
  2  tenant 1  gdrive      policy                        config_json=NULL
  5  tenant 4  repository  Hướng dẫn sử dụng Hotel Admin  config_json=NULL
```

id=5는 go2joy(tenant 4) 운영자가 **실제로 등록해 둔 것**입니다. 등록은 됐고 수집 경로가 없어
아무 일도 일어나지 않았습니다 — 이 작업 전체가 겨냥한 바로 그 상태입니다.
⚠️ 둘 다 `config_json`이 NULL이라, 어댑터가 생기면 "준비중"에서 **"실패"로 바뀝니다**(§3 G6).

### 1.3 실측한 GitHub API (스테이징 호스트에서 직접, 비인증)

| 확인 | 결과 |
|---|---|
| `GET /repos/{o}/{r}/git/trees/{ref}?recursive=1` | **1요청으로 전체 트리** — 589엔트리, `truncated:false`, 각 blob에 `path`·`size`·**`sha`** |
| 비인증 레이트리밋 | `x-ratelimit-limit: 60` (시간당) |
| 없는 레포 | `404` |
| 스테이징 → `api.github.com` 아웃바운드 | **열려 있음** |
| 파일 크기 현실 | 같은 레포 `CHANGELOG.md`가 **205 KB** |

## 2. TO-BE

1. **소스 타입 `repository` 동작**: `/knowledge` 소스 추가에서 `owner/repo`(+ 선택 브랜치·경로)를
   입력하면 그 안의 문서 파일이 KB 문서가 된다.
2. **인증 = GitHub PAT**, 테넌트당 1개, gdrive 서비스계정·노션 토큰과 동일한 모델.
3. **수집 규칙**: 지정 경로 아래 **재귀 전체**의 `.md`/`.markdown`/`.mdx`/`.txt` 파일 = 각 1문서.
4. **연결 테스트**: 토큰 유효성과 "그 레포에 접근 권한이 있는가"를 구분해 안내
   (GitHub도 없는 레포와 권한 없는 레포를 **똑같이 404**로 답함 — gdrive "0 files", 노션
   `object_not_found`와 같은 함정의 GitHub판).
5. **안전장치**: `trustEmptyListing=false`, 트리 `truncated` 보고, 파일 수·크기 상한과 그 보고.

### 범위 제외 (적정기술)
- GitHub App / OAuth — 내부 PAT로 충분, 앱 등록·심사 불필요.
- **비인증 공개 레포 지원** — 시간당 60회는 **서버 IP 단위 공유**라 즉시 고갈. 토큰 필수.
- 웹훅 기반 자동 동기화, 코드 파일 수집, PR/이슈 수집 — 후속.
- blob `sha` 기반 무변경 파일 건너뛰기 — §5 C4 참조(백로그).

## 3. 갭 분석

| # | 갭 | 대응 |
|---|-----|------|
| G1 | GitHub 클라이언트 없음 | `github.client.ts` — fetch 전용(SDK 無), `X-GitHub-Api-Version` 고정, 레이트리밋 헤더 존중 |
| G2 | 대상 지정·검증 없음 | `github.util.ts` — `owner/repo`·전체 URL·`git@` 형태에서 좌표 추출, PAT 형식 검증 |
| G3 | 자격증명 저장/테스트 없음 | `github-credential.service.ts` — 노션 서비스와 동형(3번째이므로 패턴 확정됨) |
| G4 | 어댑터 미등록 | `repository.adapter.ts` + 모듈 등록 (enum·DTO는 **이미 있음**) |
| G5 | 콘솔 UI/훅/i18n 없음 | 모달 분기 + `SourceCredentialCard` 3회째 재사용 + i18n 6종 |
| G6 | **미설정 소스가 500으로 실패** | 어댑터 설정 오류는 `BusinessException(VALIDATION_FAILED,400)` — 지금은 평범한 `Error`라 500 "Internal server error"가 되어 이유가 가려짐. 스테이징에 해당 소스 2건 실재 |

**마이그레이션 불필요**: `type varchar(16)`에 'repository' 수용(이미 저장돼 있음),
`provider varchar(32)`에 'github', PAT는 secret 컬럼에 여유.

## 4. 사용자 흐름

1. 운영자: GitHub → Settings → Developer settings → **fine-grained PAT**(대상 레포 지정,
   Repository permissions → **Contents: Read-only**) 발급.
2. `/knowledge` → GitHub 카드에 토큰 등록 → 연결 테스트.
3. 소스 추가 → 유형 `repository` → `owner/repo` 입력(+ 브랜치·경로 선택) → 등록.
4. 동기화 → 문서 수집·임베딩 → 위젯 답변이 원본 파일 링크와 함께 인용.
5. 레포에서 문서 수정 → 재동기화 시 갱신, 파일 삭제 → 숨김, 권한 회수 → **가드 발동**.

## 5. 제약·전제

- C1. `X-GitHub-Api-Version: 2022-11-28` 고정.
- C2. 인증 시 시간당 5,000회. 트리는 1요청이지만 **본문은 파일당 1요청** → 파일 수 상한 필요.
- C3. 트리 API는 엔트리 100k 또는 7MB 초과 시 `truncated: true`로 잘라서 응답 — 이 경우
  "조용히 일부만"이 되므로 반드시 보고.
- C4. 트리가 주는 blob `sha`는 곧 콘텐츠 해시라 무변경 파일의 본문 요청을 건너뛸 수 있으나,
  현재 파이프라인은 `content` 비교로 무변경을 판정하므로 **어댑터가 본문 없이 답할 수 없습니다.**
  전 어댑터에 영향을 주는 계약 변경이라 **백로그**로 둡니다(실측: 문서 24개 = 24요청, 5,000/hr 대비 무의미).
- C5. 실 E2E는 **사용자 PAT + 대상 레포 필요**. gdrive·notion과 동일하게 모킹까지는 자체 수행.

## 6. 에러코드

gdrive·notion과 동일 방침 — 전용 Exxxx 없이 `VALIDATION_FAILED` + 상세 메시지.

## 7. 결론

세 번째 어댑터를 만들며 확정된 패턴이 있어 **순수 신규는 GitHub 클라이언트 하나**입니다.
노션과 달리 본문 변환기가 필요 없습니다 — Markdown·텍스트는 이미 텍스트입니다.
설계상 유일하게 새로운 판단은 **재귀 수집**(gdrive·notion은 flat)이며, 근거는 트리 API가
1요청으로 전체를 주기 때문입니다. 상세는 `PLN-260821-Knowledge-Repository-Source.md`.

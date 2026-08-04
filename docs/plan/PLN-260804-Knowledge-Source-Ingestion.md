# PLN — board / repository / gdrive 소스 수집 구현 계획

| | |
|---|---|
| Doc ID | CHATWIDGET-PLN-KBSRC-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 문서 | `docs/analysis/REQ-260804-Knowledge-ProductGroup-SourceIngestion.md` (v1.0.1, PR #101) |
| 범위 | **요구 ②** — 세 소스 타입의 실제 수집. ①(그룹·CSV)은 배포 완료 |
| 상태 | 착수 — 단, **S2·S3은 자격증명 확보 전까지 검증 불가**(§0-1) |
| UI 영향 | **있음** — 소스 카드에 주소 입력·동기화 상태 (§3 와이어프레임) |
| 스키마 변경 | **있음** — `kb_documents` 재사용 + `knowledge_sources` 동기화 상태 컬럼 |

---

## 0. 확정된 결정 (REQ §5)

| # | 결정 | 채택안 |
|---|---|---|
| **D5** | `board`의 정의 | **내부 게시판** — 기존 `kb_board_posts` 활용, 외부 크롤러 불필요 |
| D6 | 동기화 방식 | **수동 트리거 + 주기 폴링**(웹훅은 후속) |
| D7 | 원본 삭제 시 | **숨김(`active=0`)** — 하드 삭제는 되돌릴 수 없음 |
| D9 | 순서 | board → gdrive → repository |

### 0-1. ⚠️ 착수 전 확인된 제약 — 자격증명이 없습니다

스테이징 실측:

```
integration_credentials:  shopify 1건뿐 (secret_enc 204B)
integration_status:       google_drive "connected" ← 실제 자격증명 없음, 표시만
GitHub:                   provider 자체가 없음
knowledge_sources:        board/gdrive 2건, config_json 둘 다 NULL
```

`integration_status`의 `google_drive: connected`는 **시드 데이터이며 실제 연결이 아닙니다.**

| 소스 | 필요 자격증명 | 현재 | 결과 |
|---|---|---|---|
| **board** | 없음(내부) | — | **지금 완전 검증 가능** |
| gdrive | 서비스 계정 키 또는 OAuth | **없음** | 구현은 가능하나 **실 API 검증 불가** |
| repository | GitHub PAT | **없음** | 동일 |

> 검증할 수 없는 외부 연동을 한 번에 다 쓰면, 자격증명이 생기는 시점에 대부분을 다시 만지게 됩니다.
> **S1(공용 파이프라인 + board)을 먼저 완결**하고, S2·S3은 자격증명 확보 후 진행하는 것을 권합니다.

---

## 1. 단계 구성

| 단계 | 범위 | 검증 | 규모 |
|---|---|---|---|
| **S1** | 공용 수집 파이프라인 + **board 어댑터** | **완전 검증 가능** | 2.5d |
| S2 | gdrive 어댑터 | 자격증명 필요 | 2.5d |
| S3 | repository 어댑터 | 자격증명 필요 | 2d |
| | **합계** | | **7d** |

**이번 착수 범위는 S1입니다.** S2·S3은 자격증명이 준비되면 이어서 진행합니다.

---

## 2. S1 — 공용 파이프라인 + board (2.5d)

### 2-1. 왜 파이프라인을 먼저 만드는가

세 타입 모두 동작이 같습니다.

```
외부/내부 원문 조회 → 텍스트 정규화 → kb_documents 업서트 → 배치 임베딩 → 결과 리포트
                                          ↑
                        ①의 CSV 임포터가 이미 이 형태입니다
```

CSV 임포터(`ProductImportService`)가 사실상 첫 번째 어댑터입니다. 공통부를 뽑아내면
board·gdrive·repository가 **각자 "원문 목록을 내놓는 함수" 하나**만 구현하면 됩니다.

### 2-2. 어댑터 인터페이스

```ts
interface SourceItem {
  externalKey: string;      // 소스 내 안정 키 (board: post id)
  title: string;
  content: string;
  sourceUrl: string | null;
  category: string | null;
}

interface SourceAdapter {
  readonly type: 'board' | 'gdrive' | 'repository';
  /** 설정 검증 — 저장 전에 호출. 실패 사유를 문자열로. */
  validateConfig(config: Record<string, unknown>): string | null;
  /** 현재 원문 전체를 나열. 증분은 파이프라인이 판단. */
  fetchAll(tenantId: number, source: KnowledgeSource): Promise<SourceItem[]>;
}
```

파이프라인이 담당하는 것(어댑터가 다시 만들지 않는 것):
- `(tenant, group, external_key)` 업서트 — ①에서 검증된 규칙
- **내용 무변경 시 건너뛰기**, 단 `status !== 'embedded'`면 재색인 (①에서 실데이터로 잡은 결함)
- **배치 임베딩(64)** + stub 폴백 거부 (PR #94/#95)
- 수정 이력·감사 기록 (T3 연동)
- **사라진 원문 숨김 처리**(D7)
- 결과 리포트

### 2-3. board 어댑터

현재 `createPost()`는 `kb_board_posts`에 행만 쓰고 **지식이 되지 않습니다**(실데이터 0행).

- `fetchAll` = 해당 소스의 게시글을 `SourceItem[]`으로 변환
  (`externalKey = post:{id}`, `title`, `content = body`)
- 글 작성·수정 시 **즉시 동기화**하고, 소스 단위 재동기화도 가능하게 합니다.
- 게시글 삭제 → 문서 `active=0`(D7).

> 게시판은 외부 호출이 없어 **rate limit도, 자격증명도 없습니다.** 파이프라인을 실제로
> 굴려볼 수 있는 유일한 어댑터라 먼저 만드는 이유이기도 합니다.

### 2-4. 스키마

```sql
ALTER TABLE knowledge_sources
  ADD COLUMN last_sync_at     DATETIME NULL,
  ADD COLUMN last_sync_status VARCHAR(16) NULL,   -- ok | failed | never
  ADD COLUMN last_sync_result JSON NULL;          -- {created, updated, skipped, hidden, failed}
```

`kb_documents`는 ①에서 만든 `doc_group`·`external_key`를 그대로 씁니다 —
**소스 수집 문서는 `doc_group='counsel'`**, `source_id`로 소스와 연결합니다.

`config_json`은 타입별로 다릅니다.

| 타입 | config_json |
|---|---|
| board | `{}` (내부라 설정 없음) |
| gdrive | `{ folderId }` |
| repository | `{ owner, repo, branch, paths: [] }` |

### 2-5. 동기화 트리거 (D6)

- **수동**: `POST /knowledge/sources/:id/sync` — 콘솔 버튼
- **주기**: 기존 스케줄러 패턴(`QuestionStatsService`)과 동일하게
  `SOURCE_SYNC_INTERVAL_HOURS`(기본 6h, 0이면 비활성). 첫 실행은 부팅 15분 후.
- board는 글 저장 시 **즉시 반영**하므로 폴링 대상에서 제외합니다(불필요한 부하).

---

## 3. 콘솔 (S1)

```
┌─ Sources ────────────────────────────────── [소스 추가] ─┐
│ 이름            유형   상태    마지막 동기화        동기화 │
│ IVY Help Center board  사용중  8/4 22:10 · 12건    [↻]   │
│ policy          gdrive 준비중  —                   [↻]   │  ← 미구현 타입 표시
└──────────────────────────────────────────────────────────┘

┌─ 소스 추가 ──────────────────────────────────┐
│ 유형  [게시판 ▼]                              │
│ 이름  [IVY Help Center            ]           │
│                                               │
│ (게시판은 추가 설정이 없습니다)                │
│                          [취소]  [추가]       │
└───────────────────────────────────────────────┘
```

- **미구현 타입(`gdrive`/`repository`)은 "준비중"으로 표시**하고 동기화 버튼을 비활성화합니다.
  REQ §7의 지적 — 지금은 등록하면 "Enabled"로 보이는데 실제로는 아무 일도 일어나지 않습니다.
- 동기화 결과(생성/갱신/변경없음/숨김/실패)를 마지막 동기화 옆에 표시합니다.

---

## 4. 사이드 임팩트

| 영역 | 영향 | 대응 |
|---|---|---|
| **RAG 답변** | 게시판 글이 지식에 추가됨 | `doc_group='counsel'`이라 정책 질의와 같은 축. 의도된 동작 |
| 충돌 스캔 | 게시글이 정책과 중복될 수 있음 | 그룹 내 비교라 정상 동작(①에서 추가) |
| 수정 이력 | 동기화로 인한 변경도 기록됨 | **의도된 동작**. actor는 트리거한 사용자 |
| 임베딩 비용 | 게시글 수만큼 | 배치 처리, 내용 무변경은 건너뜀 |
| 기존 `createPost` | 지금은 지식이 안 됨 | **동작 변경** — 글 작성이 곧 지식 등록이 됨. 콘솔에 안내 필요 |
| 삭제 동기화 | 원문 삭제 → 문서 숨김 | 하드 삭제 아님(D7). 되돌리려면 `active=1` |
| 미구현 타입 | 등록만 되고 동작 안 함 | **"준비중" 표시로 오해 제거** |

---

## 5. 테스트 계획 (S1)

- **파이프라인**: 신규 생성 · 내용 변경만 갱신 · 무변경 건너뜀 · **무변경이지만 미색인이면 재색인** ·
  사라진 원문 숨김 · 배치 임베딩(단건 아님) · stub 폴백 시 실패 처리
- **board 어댑터**: 게시글 → SourceItem 변환 · `externalKey` 안정성 · 빈 본문 처리
- **격리**: 다른 소스의 문서를 건드리지 않음 · 다른 테넌트 불가시
- **동기화 상태**: 성공/실패가 `last_sync_*`에 기록됨
- **미구현 타입**: `sync` 호출 시 명확한 오류(조용한 무동작 금지)

---

## 6. 마이그레이션

`sql/migration_source_sync_state.sql` — `knowledge_sources` +3컬럼(nullable). 추가 전용, 백필 없음.

---

## 7. S2 · S3 (자격증명 확보 후)

| 단계 | 선행 필요 |
|---|---|
| **S2 gdrive** | Google 서비스 계정 키(또는 OAuth 클라이언트) + 대상 폴더 공유 |
| **S3 repository** | GitHub PAT(또는 App) + 대상 레포·브랜치·경로 |

두 어댑터 모두 `SourceAdapter` 인터페이스만 구현하면 되므로, 파이프라인·업서트·임베딩·이력은
S1에서 이미 완성된 것을 그대로 씁니다. 자격증명은 기존 `integration_credentials`의
AES-GCM 암호화를 재사용합니다.

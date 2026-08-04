# RPT — 소스 수집 파이프라인 + board 어댑터 (S1)

| | |
|---|---|
| Doc ID | CHATWIDGET-RPT-KBSRC-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 문서 | REQ-260804-Knowledge-ProductGroup-SourceIngestion (PR #101) · PLN-260804-Knowledge-Source-Ingestion (PR #109) · TCR-260804-Knowledge-Source-Ingestion |
| PR | **#109** — squash `f18cc4e` |
| 배포 | **staging 반영 완료** (2026-08-04 23:23 KST) · production 미배포 |
| 마이그레이션 | `sql/migration_source_sync_state.sql` — staging **적용 완료**, production 미적용 |

---

## 1. 무엇이 문제였나

요구 ②의 출발점은 "board / repository / gdrive가 **실제로 동작하는지** 확인"이었습니다.
확인 결과 **세 타입 모두 동작하지 않았습니다.**

- 소스를 등록하면 `knowledge_sources`에 행만 쓰이고 수집 경로가 없었습니다.
- 그런데 콘솔에는 **"Enabled"로 표시**되어, 등록만 하면 지식이 쌓이는 것처럼 보였습니다.
- 게시판도 같습니다. `createPost()`는 `kb_board_posts`에 행을 쓰고 끝나서,
  **어떤 검색 경로도 그 글을 읽지 않았습니다.**

가장 위험한 부분은 기능이 없다는 사실 자체가 아니라, **없다는 것이 화면에 드러나지 않았다는 점**입니다.

## 2. 착수 범위를 S1로 좁힌 이유 (실측)

스테이징 자격증명을 먼저 확인했습니다.

```
integration_credentials:  shopify 1건뿐
integration_status:       google_drive 'connected'  ← 실제 연결 아님, 시드 데이터
GitHub:                   provider 자체가 없음
knowledge_sources:        board/gdrive 2건, config_json 둘 다 NULL
```

gdrive·repository는 **실 API로 검증할 방법이 없습니다.** 검증 불가능한 외부 연동을
한꺼번에 작성하면 자격증명이 생기는 시점에 대부분을 다시 만지게 되므로, 외부 의존이
전혀 없는 board로 파이프라인을 실증하는 데까지를 이번 범위로 했습니다.

## 3. 변경 내용

| 파일 | 역할 |
|---|---|
| `source-adapter.interface.ts` | 어댑터는 "지금 소스에 무엇이 있는가"만 답함 |
| `source-sync.service.ts` | 업서트·건너뜀·숨김·배치 임베딩·이력 — 공용 파이프라인 |
| `adapters/board.adapter.ts` | 게시글 → SourceItem (`post:{id}`, 빈 본문 제외) |
| `knowledge.service.ts` | `syncSource()` 2단계(정합화 → 배치 임베딩), `createPost` 즉시 반영 |
| `knowledge.controller.ts` | `POST /knowledge/sources/:id/sync` |
| `knowledge.mapper.ts` | 응답에 `supported` · `lastSync*` 추가 |
| `entity/knowledge-source.entity.ts` | 동기화 상태 3개 컬럼 |
| `KnowledgePage.tsx` · `knowledge.hooks.ts` · locales × 3 | 마지막 동기화·건수·동기화 버튼·**"준비중"** 표시 |
| `sql/migration_source_sync_state.sql` | 추가 전용 마이그레이션 |
| spec × 2 | 단위 16건 |

### 파이프라인에 미리 반영한 것 (CSV 임포트에서 실데이터로 겪은 결함)

| 규칙 | 왜 |
|---|---|
| 무변경이어도 `status !== 'embedded'`면 **재색인** | 이전 부분 실패로 `pending`에 남은 문서가 영영 검색되지 않던 문제 (PR #104) |
| **배치 임베딩(64)** | 문서당 1콜은 어댑터가 재시도하지 않는 형태 (PR #95) |
| stub 폴백 거부 | 429 한 번이 죽은 벡터를 영구히 심던 문제 (PR #94) |
| 원문 삭제 = **숨김** | 하드 삭제는 되돌릴 수 없고 수정 이력의 대상까지 없앰 (D7) |

### 조용한 실패를 없앤 부분

- 미구현 타입 sync → **예외**(`BusinessException`), `last_sync_status='failed'` 기록
- 콘솔은 gdrive/repository를 **"준비중"** 으로 표시하고 동기화 버튼 비활성화
- 동기화 결과 토스트가 생성/갱신/변경없음/숨김/**미색인**을 모두 표시

## 4. 검증 결과

TCR 참조. 요약:

- 단위 **16건 추가**, 전체 **523 passed / 50 suites**
- 로컬 실환경(실 DB + 실 임베더) 시나리오 5건 전부 기대대로
  (생성 → 무변경 → 수정 → 삭제 → 미구현 타입 거부)
- 수정 이력이 바뀐 필드만 정확히 기록 (`['content']`, `['active']`)
- 마이그레이션 멱등성 확인, 기존 행 NULL 유지
- 부팅 확인 (`Nest application successfully started`) — 엔티티 컬럼 추가는 `tsc`로 못 잡음

## 5. 배포 기록

| 환경 | 상태 | 근거 |
|---|---|---|
| **staging** | ✅ 반영 완료 | 마이그레이션 선적용 → 코드 배포 → 컨테이너 13초 전 재생성, 부팅 로그 정상, `POST …/sync` **401**(배포됨), 스키마 오류 로그 0건 |
| production | ❌ 미배포 | 프로덕션 호스트 자체가 아직 없음 (CLAUDE.md §6) |

배포 순서는 SQL 선적용 → 코드 배포를 지켰습니다(구버전 코드 + 신규 컬럼은 안전, 반대는 500).

## 6. 남은 것

| 항목 | 필요한 것 |
|---|---|
| **스테이징 실사용 확인** | 현재 `kb_board_posts` **0건**. 운영자가 콘솔에서 첫 글을 쓰면 그 시점에 지식이 됩니다 |
| **S2 gdrive** | Google 서비스 계정 키(또는 OAuth) + 대상 폴더 공유 |
| **S3 repository** | GitHub PAT + 대상 레포·브랜치·경로 |
| 주기 폴링 | PLN §2-5. 현재는 수동 + 글 저장 시 자동 |
| `@ivy/api:lint` | **이번 변경과 무관한 기존 갭** — ESLint 설정 파일이 리포지토리에 없음 |

S2·S3은 `SourceAdapter`의 `fetchAll` 하나만 구현하면 되고, 업서트·임베딩·이력·숨김은
이번에 완성된 파이프라인을 그대로 씁니다.

## 7. 동작이 바뀐 것 (운영 안내 필요)

**게시글 작성이 곧 지식 등록이 됩니다.** 이전에는 글을 써도 AI 답변에 쓰이지 않았지만,
이제 저장 즉시 `doc_group='counsel'` 문서로 색인되어 정책 문서와 같은 축에서 검색됩니다.
게시글을 지우면 문서는 삭제가 아니라 **숨김** 처리됩니다.

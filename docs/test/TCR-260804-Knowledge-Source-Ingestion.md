# TCR — 소스 수집 파이프라인 + board 어댑터 (S1)

| | |
|---|---|
| Doc ID | CHATWIDGET-TCR-KBSRC-1.0.0 |
| 작성일 | 2026-08-04 |
| 선행 문서 | `docs/plan/PLN-260804-Knowledge-Source-Ingestion.md` §5 |
| 대상 | PR #109 (`f18cc4e`) |
| 결과 | **단위 16건 통과 · 실환경 시나리오 5건 통과** |

---

## 1. 단위 테스트

`apps/api/src/domain/knowledge/source-sync.service.spec.ts` (11건)

| # | 케이스 | 검증 내용 | 결과 |
|---|---|---|---|
| U1 | 신규 항목 | 문서 생성, `doc_group='counsel'`, `status='pending'` | ✅ |
| U2 | 무변경 + 색인완료 | 저장 없음, 임베딩 대상 아님, 이력 없음 | ✅ |
| U3 | **무변경 + 미색인** | `skipped`로 세지만 **재색인 대상에 포함** | ✅ |
| U4 | 내용 변경 | `updated`, `status`가 `pending`으로 되돌아감, 이력 `update` | ✅ |
| U5 | 원문 사라짐 | `active=0`으로 숨김, **삭제 아님** | ✅ |
| U6 | 이미 숨긴 항목 | 재차 숨기지 않음(`hidden=0`), 저장 없음 | ✅ |
| U7 | 숨긴 항목 재등장 | `active=1` 복구 + 재색인 | ✅ |
| U8 | 어댑터가 중복 키 반환 | 마지막 것이 이기지 않고 `failed`로 보고 | ✅ |
| U9 | **미구현 타입 sync** | 조용한 무동작이 아니라 예외 | ✅ |
| U10 | 지원 타입 조회 | `['board']` | ✅ |
| U11 | 인라인 임베딩 금지 | 파이프라인은 id만 반환, 전부 `pending` | ✅ |

`apps/api/src/domain/knowledge/adapters/board.adapter.spec.ts` (5건)

| # | 케이스 | 검증 내용 | 결과 |
|---|---|---|---|
| B1 | 게시글 → SourceItem | `post:{id}` 키, 제목/본문/카테고리 매핑 | ✅ |
| B2 | **제목 변경 시 키 안정성** | 이름이 바뀌어도 `externalKey` 동일 | ✅ |
| B3 | 빈 본문 | 빈 문자열·공백·NULL 모두 제외 | ✅ |
| B4 | 테넌트·소스 스코프 | `where {tenantId, sourceId}` | ✅ |
| B5 | 설정 검증 | 내부 게시판은 설정 없음 → `null` | ✅ |

전체: **`Test Suites: 50 passed` · `Tests: 523 passed`**

> U3·U8·U9는 목(mock)만으로 통과하기 쉬운 케이스가 아니라, 지난 CSV 임포트에서
> 실데이터로 드러난 결함을 그대로 케이스화한 것입니다.

---

## 2. 실환경 통합 시나리오 (로컬 dev DB + 실제 Voyage 임베더)

게시글 2건(1건은 빈 본문)으로 시작해 4단계를 순서대로 실행했습니다.

| # | 시나리오 | 기대 | 실제 |
|---|---|---|---|
| I1 | 최초 동기화 | 빈 초안 제외, 1건 생성·색인 | `fetched:1 created:1 embedded:1` ✅ |
| I2 | 무변경 재동기화 | 건너뜀, 임베딩 호출 없음 | `skipped:1 embedded:0` ✅ |
| I3 | 본문 수정 | 갱신 + 재색인 | `updated:1 embedded:1` ✅ |
| I4 | 원문 삭제 | 문서는 남고 숨김 | `hidden:1`, `active=0`, 행 존재 ✅ |
| I5 | gdrive 동기화 | 명확한 실패 | `BusinessException` + `last_sync_status='failed'` ✅ |

수정 이력이 **정확히 바뀐 필드만** 기록하는지 함께 확인했습니다.

| revision_no | change_kind | changed_fields |
|---|---|---|
| 1 | create | title, category, content, … |
| 2 | update | **`['content']`** — 본문만 바뀐 단계 |
| 3 | update | **`['active']`** — 숨김 단계 |

동기화 상태도 기록됩니다: `last_sync_status='ok'`, `last_sync_result={hidden:1,…}`.

---

## 3. 마이그레이션 검증

scratch DB(`scratch_src`)에 기존 소스 2행을 넣고 확인:

| 케이스 | 결과 |
|---|---|
| 최초 적용 | 3개 컬럼 생성 ✅ |
| **재적용(멱등)** | `knowledge_sources sync columns already present` — 변경 없음 ✅ |
| 기존 행 | `last_sync_at`/`status` 모두 NULL 유지 = "한 번도 동기화 안 함" ✅ |

---

## 4. 부팅 검증

엔티티에 nullable 컬럼 3개를 추가했으므로 `tsc`로는 잡히지 않는
DataSource 초기화 실패 가능성이 있어 실제 부팅으로 확인했습니다.

```
Nest application successfully started
Mapped {/api/v1/knowledge/sources/:id/sync, POST} route
```

---

## 5. 스테이징 배포 검증

| 항목 | 결과 |
|---|---|
| 마이그레이션 선적용 | 3개 컬럼 생성, 기존 소스 2건 NULL ✅ |
| 컨테이너 재빌드 | `ivy_api_staging` 13초 전 생성 ✅ |
| 부팅 로그 | `Nest application successfully started` ✅ |
| 신규 라우트 | `POST /knowledge/sources/1/sync` → **401**(배포됨, 인증만 필요) ✅ |
| 스키마 오류 로그 | `Unknown column` / `doesn't exist` 0건 ✅ |

---

## 6. 커버되지 않은 것

| 항목 | 사유 |
|---|---|
| **스테이징 실데이터 동기화** | 현재 `kb_board_posts` **0건** — 운영자가 첫 글을 작성해야 의미 있는 실행이 됩니다. 파이프라인 자체는 로컬 실환경(§2)에서 검증 완료 |
| gdrive / repository 어댑터 | 미구현(S2·S3). 자격증명 없음 — 현재는 "준비중" 표시 + sync 시 명확한 실패까지가 범위 |
| 주기 폴링 | PLN §2-5의 스케줄러는 이번 범위 밖. 현재는 수동 트리거 + 글 저장 시 자동 반영 |
| E2E HTTP(supertest) | 리포지토리 전체의 기존 갭 (CLAUDE.md §6) |

> 참고: `@ivy/api:lint`는 **이 변경 이전부터** 실패합니다 — ESLint 설정 파일이 리포지토리에
> 존재하지 않습니다(`git ls-files | grep eslint` → 0건). 이번 작업과 무관한 별건입니다.

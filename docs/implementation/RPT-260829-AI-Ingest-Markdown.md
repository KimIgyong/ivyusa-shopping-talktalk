# RPT-260829 — AI 임포트 마크다운(.md) 형식 추가

REQ `REQ-260829-AI-Ingest-Markdown.md` · PLN `PLN-260829-AI-Ingest-Markdown.md` · TCR `TCR-260829-AI-Ingest-Markdown.md`

| | |
|---|---|
| PR | **#454** (squash) |
| main 커밋 | **232d6d4** |
| 스키마 변경 | **없음** — 마이그레이션 0건 |
| 스테이징 | **배포 완료** 2026-08-29 09:53 UTC (`shoptalk.amoeba.site`, main 232d6d4, api·web·widget 재빌드) |
| 프로덕션 | 미배포(환경 자체가 미구축) |

## 1. 요구와 결과

요구: **AI 임포트에 md 파일 형식 추가.**
결과: `/knowledge` → [AI 임포트] → 파일 업로드 탭이 `.md`/`.markdown`을 받는다. 나머지 파이프라인
(원본 보관 → 추출 → 청킹 → LLM 아티클 분절 → 운영자 검수 → 보드 게시 → 원본 첨부)은 무변경.

## 2. 변경 파일

| 파일 | 변경 |
|---|---|
| `apps/api/src/domain/knowledge/file-extract.util.ts` | `md`/`markdown` 분기 + `extractMarkdown()`(BOM 제거·선두 프런트매터 제거·모지바케 E5067), 공통 후처리에서 **마크다운은 줄바꿈만 트림** |
| `apps/api/src/domain/knowledge/knowledge-ingest.service.ts` | 확장자 게이트 정규식 |
| `apps/api/src/domain/knowledge/knowledge.controller.ts` | Swagger 요약 |
| `apps/api/src/global/constant/error-code.constant.ts` | E5066 메시지에 `.md/.markdown` |
| `apps/web/src/domain/knowledge/AiIngestModal.tsx` | `accept=".pdf,.docx,.xlsx,.csv,.md,.markdown"` |
| `apps/web/src/i18n/locales/{en,ko,es,vi,ja,zh}/knowledge.json` | `ingestFileHint`, `ingestError.E5066` (키 추가 없음, 값만) |
| 스펙 2종 | 단위 케이스 7건 추가 |

## 3. 설계 판단 (왜 이렇게)

- **마크다운을 마크다운 그대로 넘긴다.** 보드 문서는 MD 원문 저장이라 서식을 벗기면 표가 통째로
  사라지고, 헤딩은 LLM의 아티클 분절 신호이기도 하다. 실제 스테이징 결과 20개 초안 **전부**
  마크다운 서식을 유지했다.
- **선두 YAML 프런트매터만 제거.** 메타데이터가 첫 청크를 오염시켜 "name/description" 쓰레기
  아티클을 만든다. 본문 중간 `---`는 수평선이므로 유지 — 테스트가 이 경계를 고정한다.
- **공통 `trim()`을 마크다운에 그대로 쓰지 않는다(리뷰 반영).** 선두 4칸 들여쓰기는 코드블록,
  말미 두 칸은 강제 줄바꿈이다. 공백을 지우면 문서의 **의미**가 바뀐다 → 마크다운은 앞뒤 줄바꿈만 제거.
- **CP949로 저장된 md는 E5067**(추출 실패). CSV 경로와 동일 기준 — 모지바케가 지식으로 등록되는
  쪽이 더 나쁘다.
- **`.markdown` 별칭 표기 범위**: 계약 표면(E5066 실패 문구·Swagger)에만 명시하고 화면 안내는
  `md`로 요약. 파일 선택창이 두 확장자를 모두 열어주므로 운영자가 막히는 지점이 없고, 정확도가
  필요한 곳은 "왜 거절됐는가"를 읽는 실패 문구다.

## 4. 검증

**로컬**
- `npm --workspace apps/api run test` — **178 suites / 1,792 tests PASS**
- `npm run typecheck` 9/9 · `npm run i18n:check` es·ko·vi·ja·zh complete
- 실파일(목 없음): `reference/go2joy-hotel-admin-kb.md` 12,013자 → `kind=md`, 헤딩·표 보존

**스테이징 E2E (go2joy, tenant 4 · `smoke.notion@amoeba.group`)**

| # | 확인 | 결과 |
|---|---|---|
| 1 | `.hwp` 업로드 | E5066 — 문구가 `.md/.markdown`까지 표기 |
| 2 | `go2joy-hotel-admin-kb.md`(19,475바이트) 업로드 | 잡 시작 → 2청크 분석 → `ready`, 초안 **20건**, `truncated=false` |
| 3 | 초안 서식 | **20/20**이 마크다운 서식 유지(`**목적**`·번호 목록·표), 카테고리는 테넌트 기존 분류(대시보드·리뷰 관리·객실 유형 관리 등)로 매핑, fallback 0건 |
| 4 | 초안 1건 승인 | `saved=1`, `boardDocumentIds=['7']`, **`attachedOriginals=1`** |
| 5 | 보드 문서 7 | `published` · `operation` · 태그 `ai-import` · 본문 마크다운 유지 · 첨부 `go2joy-hotel-admin-kb.md` 19,475바이트 |
| 6 | 배포된 콘솔 번들 | `KnowledgePage-DMldauaJ.js`에 `.pdf,.docx,.xlsx,.csv,.md,.markdown`, 안내 문구 6개 언어 반영 |
| 7 | API 부팅 | `Nest application successfully started`, `ivy_api_staging` healthy, `/api/v1/health` ok |

스테이징 픽스처: **go2joy 보드 문서 id 7** = md 인제스트 승인본(원본 md 첨부 포함).

## 5. 리뷰 반영 (CodeRabbit, PR #454)

| 지적 | 판단 | 조치 |
|---|---|---|
| 공통 `trim()`이 마크다운 유의 공백을 먹는다 | 타당 | 마크다운은 줄바꿈만 트림 + 고정 테스트 추가 |
| `.markdown` 별칭이 안내 문구에 없다 | 부분 타당 | 계약 표면(E5066·Swagger)에 명시, 화면 안내는 요약 유지(위 §3) |
| PLN의 `kind` 계약이 코드와 불일치 | 타당 | PLN 정정 |

## 6. 남은 것 / 비목표

- `.txt`·`.html` 등 다른 텍스트 형식 — 요구 범위 밖(같은 파서라 추가는 한 줄).
- md 안 이미지 상대경로(`![](./img/a.png)`)는 원문대로 남아 보드에서 깨진 이미지로 보인다.
  검수 단계 정리가 현 정책.
- 보드 문서 **수동** 첨부 화이트리스트는 `.md` 미포함(승인 첨부는 `attachSharedCopy`라 무관).

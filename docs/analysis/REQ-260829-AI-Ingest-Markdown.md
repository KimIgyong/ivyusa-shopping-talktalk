# REQ-260829 — AI 임포트 마크다운(.md) 형식 추가

- 요구: **AI 임포트(AI 인제스트)에 md 파일 형식 추가**
- 관련: `REQ-260829-Knowledge-Page-Enhancements.md`(3차 R4 파일 AI 인제스트), `PLN-260829-KB-File-AI-Ingest.md`,
  `RPT-260829-KB-File-AI-Ingest.md`, Smart Knowledge Board B2(인제스트 승인 → 보드 게시)

## 1. AS-IS

AI 인제스트는 `/knowledge` → [AI 임포트] 모달 → 파일 업로드 탭 / 영상 URL 탭 2종.
파일 경로는 **확장자 4종만** 받는다.

| 지점 | 현재 값 | 위치 |
|---|---|---|
| 브라우저 파일 선택 | `accept=".pdf,.docx,.xlsx,.csv"` | `apps/web/src/domain/knowledge/AiIngestModal.tsx:195` |
| 화면 안내 문구 | "pdf · docx · xlsx · csv, 최대 15MB…" | `locales/*/knowledge.json` `ingestFileHint` |
| 요청 게이트 | `/\.(pdf\|docx\|xlsx\|csv)$/i` → E5066 | `knowledge-ingest.service.ts:70` |
| 텍스트 추출기 | `switch(ext)` pdf/docx/xlsx/csv, default → E5066 | `file-extract.util.ts:26-45` |
| Swagger | "Analyze a pdf/docx/xlsx/csv into draft articles" | `knowledge.controller.ts:441` |
| 실패 문구 | E5066 "…upload .pdf, .docx, .xlsx or .csv" | `error-code.constant.ts:215-218` + `locales/*/knowledge.json` `errors.E5066` |

파이프라인: 업로드 → 원본 보관(`kb_files`, `UPLOAD_DIR/kb-ingest/{tenant}`) → 텍스트 추출
(200,000자 상한, 초과분 `truncated`) → 12,000자 단락 경계 청크 → LLM(SUMMARY·`knowledge_ingest`)이
아티클 단위 초안 생성 → **운영자 검수·승인** → 보드 문서 게시(`ai-import` 태그) + 원본 1회 복사
공유 첨부(`attachSharedCopy`).

`.md`를 고르면 파일 선택창에 아예 보이지 않고(수동으로 골라도) 요청 단계에서 E5066으로 거절된다.

## 2. TO-BE

`.md`(및 동의 확장자 `.markdown`)를 파일 업로드 탭이 받는 5번째 형식으로 추가한다.
그 외 파이프라인·검수 화면·승인 동작·보관 정책은 **무변경**.

- 파일 선택창에서 `.md`가 선택 가능하고, 안내 문구가 5종을 표기한다.
- 서버가 `.md`를 수용하고 UTF-8 텍스트로 읽어 기존 청킹·LLM 분석에 그대로 넘긴다.
- 마크다운 **원문 서식을 보존**한다(제목·목록·표·코드블록). 보드 문서는 MD 원문 저장이므로
  추출 단계에서 서식을 벗기면 오히려 손실이다.
- 파일 앞머리 YAML 프런트매터(`---` … `---`)는 본문이 아니므로 제거한다.
- 잘못된 인코딩(CP949 등)으로 저장된 md는 CSV와 같은 기준으로 E5067(추출 실패)로 거절한다.

## 3. 갭 분석

| # | 갭 | 조치 |
|---|---|---|
| G1 | 추출기에 md 분기 없음 | `extractMarkdown()` 추가(UTF-8 디코드·BOM 제거·프런트매터 제거·모지바케 가드) |
| G2 | 요청 게이트 정규식 4종 | `md\|markdown` 추가 |
| G3 | 프런트 `accept` 4종 | `.md,.markdown` 추가 |
| G4 | 안내·실패 문구가 형식을 열거(6개 언어 × 2키) | `ingestFileHint`, `errors.E5066` 갱신 + 백엔드 E5066 메시지 |
| G5 | Swagger 요약 문구 | 5종 표기 |
| G6 | 단위 테스트 없음 | `file-extract.util.spec.ts` / `knowledge-ingest.service.spec.ts` 케이스 추가 |

**갭 아님(확인 완료)**
- 원본 보관: `kb_files.mime`은 nullable — 브라우저가 `.md`에 빈 MIME을 보내도 저장 가능. 스키마 변경 0건.
- 승인 시 원본 첨부: `attachSharedCopy()`는 확장자 화이트리스트를 거치지 않으므로 `.md` 원본도 그대로 붙는다.
- 용량: 15MB 업로드 상한·200,000자 추출 상한 그대로. 텍스트 파일이라 사실상 문자 상한이 먼저 걸린다.
- 청킹: `split()`이 이미 `\n\n` 우선 절단 — 마크다운은 모든 헤딩 앞에 빈 줄이 있어 헤딩 경계 로직 불필요.
- 권한/보안: 경로·권한(`KNOWLEDGE_SOURCE_MANAGE`)·테넌트 스코프 불변. 새 신뢰 경계 없음
  (운영자가 올린 파일 → 검수 후 게시라는 기존 관문 그대로).

## 4. 사용자 흐름 (변경분만)

1. 운영자 `/knowledge` → [AI 임포트] → 지식그룹 선택 → 파일 업로드 탭
2. 파일 선택창에 **`.md`가 보인다** → 예: `go2joy-hotel-admin-kb.md` 선택 → [분석 시작]
3. 이후 진행 표시·초안 검수·승인·보드 게시는 기존과 동일

## 5. 제약·비목표

- **비목표**: `.txt`, `.html`, `.rtf` 등 다른 텍스트 형식(요구 범위 밖 — 필요 시 별건).
- **비목표**: 보드 문서 첨부 화이트리스트(`board-attachment.service.ts:15`)에 `.md` 추가
  (수동 첨부 경로는 이번 요구 대상 아님). 인제스트 승인 첨부는 위 G-아님 항목대로 이미 동작.
- **비목표**: md 안의 이미지·상대 링크 해석. 원문 그대로 두고 운영자가 검수에서 정리한다.
- 마크다운 표는 LLM 입력에서 그대로 유지되므로 표 중심 문서는 xlsx 대신 md로도 등록 가능해진다.

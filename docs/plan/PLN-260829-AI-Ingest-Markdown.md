# PLN-260829 — AI 임포트 마크다운(.md) 형식 추가

REQ: `docs/analysis/REQ-260829-AI-Ingest-Markdown.md`
브랜치: `session/ingest-md` (origin/main 5f22fa0 기준) · 스키마 변경 **0건**(마이그레이션 없음)

## D. 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 수용 확장자 = **`.md` + `.markdown`** | 같은 파서 한 줄. `.txt`는 요구 밖(REQ §5) |
| D2 | 추출 결과는 **마크다운 원문 그대로** (서식 제거 안 함) | 보드가 MD 원문 저장(B1) → 헤딩·표·목록이 그대로 렌더. 헤딩은 LLM 분절 신호이기도 함. 표를 벗기면 정보 손실 |
| D3 | 선두 YAML 프런트매터(`---`…`---`)만 제거 | 메타데이터가 첫 청크를 오염시키고 "이름/설명" 아티클을 만들어낸다. 파일이 `---`로 시작할 때만 |
| D4 | CP949 등 비UTF-8은 **E5067**(추출 실패) | CSV 경로와 동일 기준(`raw.includes('�')`) — 모지바케 등록 방지, 사유 분리 유지 |
| D5 | `split()` 청크 경계 로직 **무변경** | 이미 `\n\n` 우선 절단이고 마크다운 헤딩 앞엔 빈 줄이 있다. 헤딩 인식 추가는 이득 없는 확장 |
| D6 | 매직바이트 검증 없음 | md는 시그니처가 없는 순수 텍스트. 인제스트 경로는 원래 확장자 게이트만(기존 정책 유지) |
| D7 | 보드 첨부 화이트리스트 무변경 | 승인 첨부는 `attachSharedCopy`라 화이트리스트를 안 탄다. 수동 첨부 확장은 별건 |

## S1 — 백엔드 추출·게이트 (apps/api)

1. `domain/knowledge/file-extract.util.ts`
   - `switch(ext)`에 `case 'md': case 'markdown': text = extractMarkdown(buffer); break;`
   - `extractMarkdown(buffer)`: `toString('utf8')` → 선두 BOM(`﻿`) 제거 → `�` 포함 시
     `INGEST_EXTRACT_FAILED` → 선두 프런트매터 블록 제거 → 그대로 반환
   - `ExtractedText.kind` 주석 `pdf | docx | xlsx | csv | md | markdown` — `.markdown`의 kind는
     `markdown`(확장자 그대로. 표시용 문자열일 뿐 소비처 분기는 없다)
   - 공통 후처리의 `trim()`은 마크다운에 **줄바꿈만** 적용 — 선두 4칸 들여쓰기(코드블록)와
     말미 두 칸(강제 줄바꿈)은 의미가 있어 공백을 지우면 문서 뜻이 바뀐다
2. `domain/knowledge/knowledge-ingest.service.ts:70` — 게이트 정규식에 `|md|markdown`
3. `domain/knowledge/knowledge.controller.ts:441` — `@ApiOperation` 요약 5종 표기
4. `global/constant/error-code.constant.ts:217` — E5066 메시지에 `.md/.markdown`
   - **별칭 표기 범위**: 계약 표면(E5066 실패 문구·Swagger)은 `.markdown`까지 명시하고, 화면 안내
     문구(`ingestFileHint`)는 `md`로 요약해 둔다 — 파일 선택창이 이미 두 확장자를 모두 열어주므로
     운영자가 막히는 지점이 없고, 정확도가 필요한 곳은 "왜 거절됐는지" 읽는 실패 문구다

## S2 — 콘솔 UI·문구 (apps/web) — **UI 변경**

5. `domain/knowledge/AiIngestModal.tsx:195` — `accept=".pdf,.docx,.xlsx,.csv,.md,.markdown"`
6. `i18n/locales/{en,ko,es,vi,ja,zh}/knowledge.json` 2키 × 6언어
   - `ingestFileHint`: `pdf · docx · xlsx · csv · md, 최대 15MB …`
   - `errors.E5066`: `지원하지 않는 파일 형식입니다(.pdf/.docx/.xlsx/.csv/.md).`
7. `npm run i18n:check`

### 와이어프레임 (변경 지점만 — 레이아웃·컴포넌트 변화 없음)

```
┌ AI 임포트 ────────────────────────────────────────────────┐
│ 지식그룹 [ 상담매뉴얼 · 상담 응대 기준 ▾ ]                 │
│ ┌────────────┬────────────┐                                │
│ │ 파일 업로드 │ 영상 URL   │                                │
│ └────────────┴────────────┘                                │
│ [ 파일 선택 ] 선택된 파일 없음                              │
│                                                            │
│ AS-IS: pdf · docx · xlsx · csv, 최대 15MB. AI가 내용을 …    │
│ TO-BE: pdf · docx · xlsx · csv · md, 최대 15MB. AI가 내용을 …│
│        └── 이 한 줄과 파일 선택창 필터만 바뀐다             │
│                                          [ 취소 ][분석 시작]│
└────────────────────────────────────────────────────────────┘
파일 선택창 필터: *.pdf;*.docx;*.xlsx;*.csv  →  + *.md;*.markdown
```

## S3 — 테스트

8. `file-extract.util.spec.ts`
   - md 원문 보존: `# 제목` / `| a | b |` 표 / 목록이 결과에 남는다, `kind === 'md'`
   - 프런트매터 제거: `---\nname: x\n---\n# 본문` → `name:` 미포함, `# 본문` 포함
   - BOM 제거 / CP949 md → E5067 / 공백 md → E5068 / 200,000자 초과 → `truncated: true`
9. `knowledge-ingest.service.spec.ts`
   - `.md` 업로드가 게이트를 통과해 잡이 시작된다(기존 `x.hwp` → E5066 케이스는 그대로 유지)
10. `npm run typecheck` + `npm --workspace apps/api run test`

## S4 — 문서·배포

11. TCR `docs/test/TCR-260829-AI-Ingest-Markdown.md`
12. PR(스쿼시) → 스테이징 배포 후 실검증: go2joy 테넌트에 `reference/go2joy-hotel-admin-kb.md`
    업로드 → 초안 생성 → 1건 승인 → 보드 문서 + 원본 `.md` 첨부 확인
13. RPT `docs/implementation/RPT-260829-AI-Ingest-Markdown.md`

## 부수 영향 분석

| 영역 | 영향 | 판정 |
|---|---|---|
| DB 스키마 | 없음. `kb_files.mime` nullable → 빈 MIME 저장 가능 | 마이그레이션 0건 → PR `## Migration` 섹션 불필요 |
| 승인 → 보드 첨부 | `attachSharedCopy`는 확장자 게이트 없음 → `.md` 원본 첨부 정상 | 무변경 |
| 첨부 다운로드 | 서명 URL 공통 경로, MIME 그대로 서빙 | 무변경 |
| AI 비용/사용량 | 계측은 게이트웨이 단일 지점(feature `knowledge_ingest`) | 무변경 |
| 다른 업로드 경로 | 위젯/라이브챗 첨부, 일괄등록(CSV/XLSX), 보드 FAQ 임포트는 각자 별도 화이트리스트 | 건드리지 않음 |
| 기존 4종 동작 | `switch` 분기 추가일 뿐 기존 case 무수정 | 회귀 위험 낮음 |
| i18n | 키 추가 없음(문구 값만 변경) → 폴백 리스크 없음 | `i18n:check` 통과 확인 |

## 리스크

- **R1** 매우 큰 md(15MB)는 200,000자에서 절단되고 `ingestTruncated` 안내가 뜬다 — 기존 정책 그대로.
- **R2** md 안의 이미지 `![](./img/a.png)` 상대 경로는 보드에서 깨진 이미지로 보인다. 검수 단계에서
  운영자가 지우는 것이 현 정책(REQ §5 비목표). 대량 이미지 문서는 자동 정리 대상이 아님을 RPT에 명시.

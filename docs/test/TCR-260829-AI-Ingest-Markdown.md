# TCR-260829 — AI 임포트 마크다운(.md) 형식 추가

REQ `REQ-260829-AI-Ingest-Markdown.md` · PLN `PLN-260829-AI-Ingest-Markdown.md`
브랜치 `session/ingest-md`

## 1. 단위 테스트 (추가분)

`apps/api/src/domain/knowledge/file-extract.util.spec.ts`

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U1 | `guide.md` — 헤딩·목록·표 | 원문 서식 그대로 보존, `kind === 'md'` | PASS |
| U2 | `doc.markdown` — 선두 프런트매터 + 본문 중간 `---` | 프런트매터만 제거(`description:` 미포함), 본문 시작 `# 본문`, 중간 수평선 유지, `kind === 'markdown'` | PASS |
| U3 | BOM 붙은 md / CP949로 저장된 md | BOM 제거 후 `# 제목` / 모지바케는 **E5067** | PASS |
| U4 | 공백만 있는 md | **E5068**(읽을 텍스트 없음) — 빈 지식 등록 방지 | PASS |
| U5 | 선두 4칸 들여쓰기 + 말미 두 칸 강제 줄바꿈 | 앞뒤 **줄바꿈만** 제거되고 공백은 보존(코드블록·강제 줄바꿈 의미 유지) | PASS |
| U6 | (기존) `video.mp4` | 여전히 **E5066** | PASS |
| U7 | (기존) 200,000자 초과 | `truncated: true`, 절단 | PASS |

`apps/api/src/domain/knowledge/knowledge-ingest.service.spec.ts`

| # | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U8 | `manual.md` 업로드 | 확장자 게이트 통과 → 잡 READY, `sourceLabel = manual.md`, **모델 프롬프트에 `# 체크인 안내` 헤딩이 그대로 실림** | PASS |
| U9 | (기존) `x.hwp` | 요청 단계에서 E5066, 잡 생성 0 | PASS |

## 2. 실파일 검증 (목 없음)

목이 무력한 경로(라이브러리 없이 자체 파싱)라 실물 md로 직접 확인.

- 대상: `reference/go2joy-hotel-admin-kb.md` (운영지식 원본, 12,013자)
- 결과: `kind=md`, `truncated=false`, 헤딩·표(`|`) 모두 보존, 선두 인용문(`> 문서 목적`) 유지
- 청킹: 12,013자 → `CHUNK_CHARS=12,000` 경계에서 단락 절단 2청크(기존 로직 그대로)

## 3. 회귀

| 항목 | 결과 |
|---|---|
| `npm --workspace apps/api run test` | **178 suites / 1,792 tests 전부 PASS** |
| `npm run typecheck` (9 tasks) | PASS |
| `npm run i18n:check` | es·ko·vi·ja·zh 전부 complete |
| 스키마 | 변경 0건 — 마이그레이션 없음 |

## 4. 통합 시나리오 (스테이징)

| # | 시나리오 | 기대 |
|---|---|---|
| I1 | `/knowledge` → [AI 임포트] → 파일 선택창 | `.md`/`.markdown`이 선택 가능, 안내 문구가 `pdf · docx · xlsx · csv · md` |
| I2 | `go2joy-hotel-admin-kb.md` 업로드 → 분석 | 추출 → 분석 진행 → 초안 목록(아티클 단위), 본문에 마크다운 서식 유지 |
| I3 | 초안 1건 승인 | 보드 문서 게시(`ai-import` 태그) + 원본 `.md` 첨부 1건 |
| I4 | `.hwp` 등 미지원 파일 | E5066 문구가 `.md` 포함해 5종 표기 |

## 5. 엣지 케이스 판단 근거

- **프런트매터 판정**: 파일이 `---` 줄로 **시작할 때만** 제거. 본문 중간 `---`는 마크다운 수평선이라 유지(U2가 고정).
- **U+FFFD 가드**: 정상 UTF-8 문서에 치환문자가 들어 있으면 함께 거절된다. CSV 경로가 이미 택한 절충 —
  모지바케 지식이 등록되는 쪽이 더 나쁘다.
- **`.markdown` 별칭 표기**: 계약 표면(E5066 문구·Swagger)에만 명시하고 화면 안내는 `md`로 요약.
  파일 선택창이 두 확장자를 모두 열어주므로 운영자가 막히는 지점이 없고, 정확도가 필요한 곳은
  "왜 거절됐는가"를 읽는 실패 문구다.
- **이미지 상대경로**: `![](./img/a.png)`는 원문 그대로 남고 보드에서 깨진 이미지로 보인다. 검수 단계에서
  운영자가 정리(PLN R2, 의도된 비목표).

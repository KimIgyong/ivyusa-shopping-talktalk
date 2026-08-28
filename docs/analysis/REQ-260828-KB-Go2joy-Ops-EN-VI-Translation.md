# REQ-260828 — go2joy 운영지식(OperationInfo) 영어·베트남어 번역 입력

- 작성일: 2026-08-28
- 요청 유형: [요구사항]
- 선행 작업: PR #431/#432 (`RPT-260828-KB-OperationInfo-BulkImport.md`) — OperationInfo
  그룹·일괄등록 파이프라인·go2joy 한국어 20건 적재 완료
- 원천: `reference/go2joy-hotel-admin-kb.md` (ko 중심 + en 병기 골격)

## 1. 요구사항 원문

지식베이스 문서에 OperationInfo — `reference/go2joy-hotel-admin-kb.md`를 **베트남어와
영어로 번역하여 입력**한다.

## 2. AS-IS

- go2joy 테넌트 OperationInfo에 **한국어(en 부분 병기) 아티클 20건** 적재됨
  (`GTJ-*` = external_key, 카테고리 5종: 대시보드/리뷰 관리/객실 유형 관리/리포트/참고자료).
- `kb_documents`에는 **language 컬럼이 없음**(기존 확인 사항) — 언어 구분은 문서 분리 또는
  본문 병기로만 가능. 기존 선례 `kb-import.ts`는 `kb-policy-{ko,en}.json`으로 **언어별
  별도 문서**를 적재.
- RAG 검색은 언어 필터 없이 임베딩 유사도(Voyage voyage-4, 다국어) — 질문 언어와 같은
  언어의 문서가 자연히 상위 랭크됨. AI 답변 언어는 `session.language`가 결정(문서 언어와 무관).
- 위젯 인용(citation)은 문서 title을 그대로 노출 — 베트남 사용자에게 한국어 제목이 보이는 상태.
- 충돌 감지 스캔은 **수동 전용**(`POST /knowledge/conflicts/scan`, 콘솔 버튼) — 자동 크론 없음.
  dismiss한 쌍은 이후 스캔에서 제외됨.
- 변환기 `scripts/convert-go2joy-kb.mjs`는 단일 언어(ko) 전제: 카테고리 맵·부록 헤딩 매칭이
  한국어 고정, external_key 접미사 개념 없음.
- go2joy는 베트남 호텔 예약 서비스 — 실제 상담 언어는 vi/en 비중이 높음.

## 3. TO-BE

- OperationInfo에 **영어 20건 + 베트남어 20건**(원문 ko 20건과 공존, 총 60건) 적재.
- 번역본은 `reference/`에 md 원본으로 보존(`go2joy-hotel-admin-kb.en.md` / `.vi.md`) —
  검수·개정·재변환 가능한 단일 원천.
- 재업로드 멱등: 언어별 external_key(`GTJ-REV-01-EN` / `GTJ-REV-01-VI`)로 기존 유니크 축
  `(tenant, doc_group, external_key)` 재사용.
- 베트남어/영어 질문 시 해당 언어 문서가 인용되는 것을 스모크로 확인.

## 4. 갭 분석

| # | 갭 | 조치 |
|---|---|---|
| G1 | 번역본 부재 | 원문 20아티클(용어집·상태값 포함) en/vi 전문 번역 md 2본 작성 |
| G2 | 변환기 언어 인지 불가 | `--lang en\|vi` 옵션: 카테고리 맵·부록 헤딩·키 접미사 언어별 처리 |
| G3 | 언어별 문서의 저장 방식 미결정 | PLN D1 (별도 문서 vs 단일 3개국어 문서) |
| G4 | 카테고리 언어 미결정 | PLN D2 (한국어 유지 vs 언어별 현지화) |
| G5 | 번역쌍이 충돌 스캔에서 중복 의심 가능 | 수동 스캔 한정 + dismiss 영구 제외로 운영 대응(PLN D5) |

## 5. 사용자 흐름 (TO-BE)

```
reference/go2joy-hotel-admin-kb.md (ko 원본)
   ├─ 번역 → go2joy-hotel-admin-kb.en.md ─┐
   └─ 번역 → go2joy-hotel-admin-kb.vi.md ─┤
                                          ├─ convert-go2joy-kb.mjs --lang {en|vi}
                                          ↓
                     CSV(키: GTJ-*-EN / GTJ-*-VI, 카테고리: 언어별)
                                          ↓
        스테이징 go2joy 일괄등록(doc_group=operation) → 임베딩
                                          ↓
   위젯/콘솔: vi 질문 → vi 문서 인용 · en 질문 → en 문서 인용 · ko는 기존 유지
```

## 6. 제약·전제

- **코드 변경은 변환기 스크립트뿐**(UI·API·스키마 무변경). 일괄등록 파이프라인 그대로 재사용.
- 번역 품질: 원문에 이미 병기된 영문 용어(Direct Discount Program, Flash Sale, Room Lock,
  Surcharge, Net Revenue 등)를 용어 기준으로 삼아 일관 번역. "보완 필요(Updating)" 표기는
  각 언어로 유지.
- 문서 워크플로우: 본 REQ → PLN 승인 후 구현 → TCR → RPT.

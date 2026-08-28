# RPT-260828 — go2joy 운영지식(OperationInfo) 영어·베트남어 번역 입력

- 요구/계획/테스트: `docs/analysis/REQ-260828-KB-Go2joy-Ops-EN-VI-Translation.md` →
  `docs/plan/PLN-…`(승인) → `docs/test/TCR-260828-KB-Go2joy-Ops-EN-VI-Translation.md`
- **PR #433** (squash) — main `6b5d688`, 2026-08-28
- 선행: PR #431/#432 (OperationInfo 그룹·일괄등록·ko 20건)

## 1. 무엇이 바뀌었나

1. **전문 번역본 2본** — `reference/go2joy-hotel-admin-kb.en.md`(영어) /
   `…kb.vi.md`(베트남어): 운영 아티클 18건 + 용어집 + 상태값 = 각 20건. GTJ ID·헤딩
   구조를 원본과 동일하게 유지해 기존 파서가 무수정으로 추출. 베트남어는 UI
   버튼·기능명에 영문 병기(`[Trả lời / Reply]`) — 현장 혼용 관행 반영.
2. **변환기 언어 옵션** — `scripts/convert-go2joy-kb.mjs --lang ko|en|vi`: 언어별
   카테고리 라벨(en: Dashboard/…, vi: Bảng điều khiển/…)·부록 헤딩 매칭·external_key
   접미사(`GTJ-REV-01-EN`/`-VI`). 무인자 호출은 기존 ko 동작 그대로.
3. **서버 코드·스키마 변경 없음** — 데이터는 PR #431의 일괄등록 API로 적재.
   언어 구분은 문서 분리(D1)·키 접미사로 해결(기존 유니크 축
   `(tenant, doc_group, external_key)` 재사용, kb_documents에 언어 컬럼 불필요).

## 2. 파일

- `reference/go2joy-hotel-admin-kb.en.md` · `reference/go2joy-hotel-admin-kb.vi.md` (신규)
- `scripts/convert-go2joy-kb.mjs` (--lang 옵션)
- REQ/PLN/TCR/RPT 문서 4종

## 3. 배포·데이터 상태

| 항목 | 상태 |
|---|---|
| PR / SHA | #433 / main `6b5d688` (머지 중 스크립트 both-added 충돌 → --lang 포함본으로 해소) |
| 마이그레이션 / 서버 배포 | **둘 다 없음**(코드 경로 무변경 — 스크립트는 로컬 도구) |
| go2joy 데이터 | en 20건 + vi 20건 **created/embedded(실 Voyage)**, 재업로드 멱등(skipped 20) |
| operation 그룹 현황 | **문서 60건 · 카테고리 15종**(언어별 5종) — ko 20건 무변경 공존 |
| ask 스모크 | 5/5 — en 질문→EN 문서 인용(0.589), vi 질문→VI 문서 인용(0.594/0.696), ko 회귀→ko 문서 1순위 유지(EN은 0.477 후순위) |

## 4. 운영 메모 / 잔여

- 개정 절차: 해당 언어 md 수정 → `node scripts/convert-go2joy-kb.mjs <input> <out.csv> --lang <l>`
  → OperationInfo 탭 [일괄등록] 재업로드(GTJ-*-{EN,VI} 키 기준 멱등 갱신).
- 충돌 스캔은 수동 전용 — 번역쌍(최대 60쌍)이 중복 후보로 잡히면 dismiss(영구 제외)로 처리(PLN D5).
- "보완 필요" 3건(GTJ-SUR-01/02, RPT-01)은 각 언어로 표기 번역해 활성 등록 — 원문 매뉴얼
  보완 시 3개 언어 md 동반 개정 필요.
- ko 원본 개정 시 en/vi 번역 동기화는 수동 — 3개 파일이 한 세트임을 유의.

## 5. 예방 패턴

- **베이스 전진 + 스쿼시 저장소에서는 PR 머지 전 브랜치 최신화가 필수**: main이 #432로
  전진하자 up-to-date 요건으로 머지 거부 + 스쿼시 특성상 신규 파일이 both-added 충돌.
  해소는 후속 작업 쪽(ours) 선택 후 기능 재검증(변환 20건 재확인) — reset이 아니라 merge로.

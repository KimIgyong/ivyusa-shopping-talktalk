# REQ-260903 — 지식베이스 일괄 다운로드·일괄 업데이트 + 범용 상담가이드

- 요청일: 2026-09-03
- 요청 유형: [요구사항]
- 관련: PLN-260828(일괄등록 D3), PR #431~#434(counsel/operation 일괄등록), PR #414(커머스 동기화)

## 1. 요구사항 원문

> https://shoptalk.amoeba.site/knowledge
> 테넌트 ivyusa 의 지식베이스문서 중 Counselinfo 내용을 다운로드하여 모든 쇼핑몰에
> 기본적으로 제공할 수 있는 범용 상담가이드로 작성해야한다.
>
> 추가로 지식베이스문서를 다운로드하여 수정하여 일괄업데이트 할수 있는 기능을 구현한다.
> productInfo, OperationInfo 에서도 일괄다운로드, 일괄업로드 되어야 하며
> 샘플 csv, 엑셀파일 제공해야한다.

요구 분해:

| # | 요구 | 종류 |
|---|------|------|
| R1 | 지식 문서 **일괄 다운로드**(내보내기) — CounselInfo·ProductInfo·OperationInfo 3그룹 모두 | 기능 |
| R2 | 다운로드한 파일을 **수정 후 재업로드하면 일괄 업데이트**(라운드트립) | 기능 |
| R3 | 3그룹 모두 **일괄 업로드** 가능 (현재 product 제외 상태 해소) | 기능 |
| R4 | 그룹별 **샘플 CSV·엑셀(xlsx) 파일 제공** | 자산 |
| R5 | ivyusa CounselInfo(245건)를 일반화한 **범용 상담가이드** 작성·제공 | 콘텐츠 자산 |

## 2. AS-IS

### 2.1 일괄등록(업로드) — 부분 존재
- `POST /knowledge/documents/import/bulk` (`bulk-import.service.ts`, PLN-260828 D3):
  CSV/XLSX, 컬럼 `category,title,content` + 선택 `external_key,source_url`.
  `external_key` 우선, 없으면 `title` 기준 **업서트**(중복 생성 없음), 변경분만 재임베딩.
  오류코드 E5061~E5065. 열 대소문자 무시, CP949 거부(E5061), 최대 5,000행.
- **단, `BULK_IMPORT_GROUPS = [counsel, operation]`** — product 그룹은 제외
  (`kb-document.entity.ts:27`). product는 전용 카탈로그 CSV 임포터
  (`product-import.service.ts`, Shopify 내보내기 형식 `Product Name,Handle,Detail,…`)만 존재.
- 콘솔 UI: 문서 카드 툴바의 [일괄등록] 버튼이 counsel/operation 탭에서만 노출
  (`KnowledgePage.tsx:1003`).

### 2.2 일괄 다운로드(내보내기) — **없음**
- 문서 내보내기 API·UI 전무. 콘솔에서 문서를 하나씩 열어보는 것 외에 대량 취득 수단 없음.
- 따라서 R2(다운로드→수정→일괄 업데이트) 워크플로우가 성립하지 않음 — 업로드 반쪽만 존재.

### 2.3 샘플 파일 — 부분 존재 (`apps/web/public/samples/`)
| 파일 | 대상 | 비고 |
|------|------|------|
| `kb-bulk-import-sample.csv/.xlsx` | counsel/operation 일괄등록 | 존재 ✅ |
| `kb-product-import-sample.csv` | product 카탈로그 임포터 | CSV만, xlsx 없음 |
| `board-faq-import-sample.csv/.xlsx` | 보드 FAQ 임포트 | 이번 범위 무관 |
- product 그룹의 **generic 문서 형식** 샘플 없음 (generic 업로드 자체가 막혀 있으므로).

### 2.4 ivyusa CounselInfo 현황 (스테이징, tenant_id=1)
- counsel 245건 / product 1,833건 / operation 0건.
- counsel 구성: **IVY Beauty CS 정책 핸드북**(번호 체계 1~9장)의 KO·EN 이중화 문서 세트
  + faq/policy 낱개 문서. 카테고리: policy_legal(46) policy_shipping(30) policy_return(24)
  policy_membership(22) policy_payment(18) policy_roundtable(14) policy_b2b(12)
  policy_beautizen(12) policy_safety(10) policy_claims(8) 외.
- 내용에 ivyusa 고유 요소 다수: 브랜드명(IVY Beauty), 자사 프로그램(Beautizen·RoundTable·
  Professional), 연락처(hello@ivyusa.com 등), 미국 화장품 업계 기준(30일 반품, CA Civil
  Code 1723, FTC 규정), 테스트 잔재("write right answer", "new category" 등 3건).
- 전 문서 합계 약 6만 자 — 내려받아 일반화 편집이 현실적인 규모.

### 2.5 관련 제약
- kb_documents에는 동기화 소유 문서가 섞여 있음: `source='product_catalog'`(카탈로그 동기화
  소유), `board`/`notion`/`google_drive` 유래 문서 등. 일괄 업데이트로 이들을 수정하면
  다음 동기화가 되돌릴 수 있음.
- 다운로드는 인증 API여야 함(테넌트 격리) — 웹 api-client에 blob 다운로드 헬퍼 없음(신규 필요).
- exceljs 이미 의존성에 있음(xlsx 파싱에 사용 중) — xlsx 생성에 재사용 가능.

## 3. TO-BE

1. **일괄 다운로드 API**: `GET /knowledge/documents/export?doc_group=&format=csv|xlsx`
   — 테넌트의 해당 그룹 문서를 일괄등록과 **동일한 컬럼**(category,title,content,
   external_key,source_url)으로 내보냄 → 내려받은 파일을 그대로 재업로드하면 무변경=skip,
   수정분만 update 되는 라운드트립 보장.
2. **product 그룹 일괄등록 허용**: `BULK_IMPORT_GROUPS`에 product 추가. 전용 카탈로그
   임포터는 그대로 유지(용도 병기 안내).
3. **콘솔 UI**: 그룹 탭(counsel/product/operation)에서 [일괄 다운로드] 제공(CSV/XLSX 선택),
   [일괄등록] 버튼을 product 탭에도 노출.
4. **샘플 파일 보강**: product generic 샘플 csv+xlsx 추가, 기존 샘플 유지.
5. **범용 상담가이드**: ivyusa counsel을 일반화(브랜드·자사 프로그램·연락처 제거, 공통
   커머스 정책 골격 유지)한 KO·EN 문서 세트를 CSV·XLSX로 작성, `/samples/`로 제공 +
   일괄등록 모달에서 다운로드 링크 노출 → 어떤 테넌트든 내려받아 수치만 고쳐 업로드하면
   기본 상담 KB가 구축됨.

## 4. 사용자 플로우 (TO-BE)

```
[신규 쇼핑몰 온보딩]
지식 페이지 → 일괄등록 모달 → "범용 상담가이드" 다운로드
  → 자사 정책값(기한·배송비·연락처)으로 수정 → 같은 모달에서 업로드
  → 245건 규모의 기본 상담 KB 즉시 구축 (업서트라 재업로드 안전)

[기존 KB 일괄 정비]
그룹 탭 선택 → [일괄 다운로드] CSV/XLSX → 엑셀에서 수정
  → [일괄등록] 업로드 → 변경 행만 update·재임베딩, 무변경 행 skip
```

## 5. 갭 분석

| 갭 | 현재 | 필요 작업 |
|----|------|-----------|
| G1 | 내보내기 API 없음 | export 엔드포인트 + CSV 직렬화 + XLSX 생성 |
| G2 | product generic 업로드 차단 | BULK_IMPORT_GROUPS 확장 + UI 노출 |
| G3 | 웹에 blob 다운로드 수단 없음 | api-client 헬퍼 + 저장 처리 |
| G4 | product generic 샘플 없음 | 샘플 csv/xlsx 작성 |
| G5 | 범용 상담가이드 없음 | ivyusa 245건 기반 일반화 콘텐츠 작성(KO·EN) |
| G6 | 동기화 소유 문서 수정 시 되돌림 위험 | 정책 결정 + 안내(§6 제약) |

## 6. 제약·리스크

- **동기화 소유 문서**: export에는 포함하되, 수정 후 업로드하면 다음 카탈로그/보드/노션
  동기화가 덮어쓸 수 있음 — 콘솔 단건 편집과 동일한 기존 의미론이므로 차단하지 않고
  모달에 안내 문구로 고지(PLN에서 확정).
- **규모**: ivyusa product 1,833건 내보내기 ≈ 수 MB — 메모리 생성으로 충분, 스트리밍 불요.
  일괄등록 상한 5,000행과 정합(초과 그룹은 현재 없음).
- **인코딩**: CSV는 UTF-8 BOM으로 내보내 한국어 엑셀에서 바로 열리게 함. 한국어 엑셀이
  CSV를 CP949로 재저장하는 함정은 기존 E5061 거부 + xlsx 권장 안내로 대응(기존 체계 유지).
- **범용 가이드 콘텐츠**: 미국 화장품 특화 조항(30일 반품, CA 1723 등)은 일반 커머스
  기본값으로 치환하되, "쇼핑몰 정책에 맞게 수정 후 등록" 안내 문서를 1행 포함.
- 스키마 변경 **없음** — 마이그레이션 불요.

## 7. 범위 제외

- 파일 업로드를 통한 문서 **삭제**(export에 없는 행 제거) — 파괴적이라 제외, 콘솔 삭제 유지.
- 신규 테넌트 시드에 범용 가이드 자동 주입 — 후속 검토(이번엔 다운로드→업로드 수동 플로우).
- 카탈로그 전용 임포터의 형식 변경·xlsx 지원 — generic 경로가 xlsx를 이미 지원하므로 불요.

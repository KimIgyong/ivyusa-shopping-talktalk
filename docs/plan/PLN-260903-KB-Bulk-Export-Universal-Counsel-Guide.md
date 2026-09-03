# PLN-260903 — 지식베이스 일괄 다운로드·일괄 업데이트 + 범용 상담가이드

- 근거: REQ-260903-KB-Bulk-Export-Universal-Counsel-Guide.md
- 스키마 변경: **없음** (kb_documents 기존 컬럼만 사용 — 마이그레이션 불요)

## 0. 설계 결정 요약

| # | 결정 | 근거 |
|---|------|------|
| D1 | export 컬럼 = import 컬럼과 **완전 동일** (`category,title,content,external_key,source_url`) | 내려받은 파일을 그대로 올리면 전행 skip이 되는 라운드트립이 기능의 본질. 내부 필드(id·status·source)를 넣으면 import가 무시하는 죽은 컬럼이 생기고 편집 실수를 유발 |
| D2 | export 대상 = 해당 그룹의 `active=1` 문서 전부(소스 불문) | 콘솔 목록과 같은 모집단. 비활성 문서는 "지금 KB가 아닌 것" — 내보내기·수정 대상이 아님 |
| D3 | product 그룹을 `BULK_IMPORT_GROUPS`에 추가 (전용 카탈로그 임포터는 별도 유지) | R3. generic 형식은 문서 자체를 다루고, 카탈로그 임포터는 쇼핑몰 내보내기 파일을 다룸 — 용도가 다르므로 공존 |
| D4 | 동기화 소유 문서(source≠knowledge_store)도 export 포함·import 수정 허용, 모달에 "동기화가 다시 덮어쓸 수 있음" 안내만 | 콘솔 단건 편집과 동일한 기존 의미론. 행 단위 차단은 "왜 내 수정만 안 되나"라는 더 나쁜 UX |
| D5 | CSV는 UTF-8 **BOM** 포함, XLSX는 exceljs로 생성 | 한국어 엑셀에서 바로 열림. exceljs는 기존 의존성 |
| D6 | 범용 상담가이드는 `/samples/universal-counsel-guide.{csv,xlsx}` 정적 자산 + 모달 다운로드 링크 | 시드 주입은 범위 외(REQ §7). 다운로드→수치 수정→업로드가 이번 플로우 |
| D7 | 가이드 external_key 체계: `GUIDE-{장}-{절}` / EN은 `-EN` 접미사 (go2joy KB에서 검증된 패턴) | 재업로드 시 안정 업서트, KO/EN 언어분리 유지 |
| D8 | export 권한 = `KNOWLEDGE_SOURCE_MANAGE` (import와 동일) | 다운로드는 일괄 업데이트 워크플로우의 절반 — 같은 권한 축 |

## 1. 단계별 계획

### P1 — 백엔드: 일괄 내보내기 (G1)
- `csv.util.ts`에 `toCsv(headers, rows)` 직렬화 추가(따옴표 이스케이프, CRLF, BOM은 호출부).
- 신규 `bulk-export.service.ts`:
  - `exportGroup(tenantId, docGroup)` → active=1 문서를 category,id 순으로 조회
  - `toCsvBuffer(docs)` (BOM+UTF-8) / `toXlsxBuffer(docs)` (exceljs, 헤더 굵게·열너비)
- `knowledge.controller.ts`: `GET /knowledge/documents/export?doc_group=&format=`
  - `@RequireCapability(KNOWLEDGE_SOURCE_MANAGE)`, `@Res()` 직접 응답,
    `Content-Disposition: attachment; filename*=UTF-8''kb-{group}-{YYMMDD}.{ext}`
  - doc_group 검증(counsel|product|operation), format 검증(csv|xlsx) — 위반 시 E1005(VALIDATION_FAILED)
- `knowledge.module.ts` 프로바이더 등록.

### P2 — 백엔드: product 그룹 일괄등록 허용 (G2)
- `kb-document.entity.ts`: `BULK_IMPORT_GROUPS`에 `DOC_GROUP.PRODUCT` 추가.
- `knowledge.service.ts` importBulk의 그룹 검증이 이 상수를 쓰는지 확인·정합(하드코딩 있으면 제거).

### P3 — 웹: UI + 다운로드 (G3)
- `api-client.ts`: `apiGetBlob(url, params)` — axios `responseType:'blob'`, 저장은
  `URL.createObjectURL` + a[download] (파일명은 Content-Disposition에서 취득).
- `knowledge.service.ts` / `knowledge.hooks.ts`: `exportDocuments(docGroup, format)` mutation
  (성공 토스트 불요 — 파일 저장 자체가 자명한 피드백, dev-kit §4.3 예외; 실패는 에러 토스트).
- `KnowledgePage.tsx`:
  - 툴바: 그룹 탭 선택 시(전체 탭 제외) [일괄 다운로드 ▾] 버튼 → CSV/XLSX 드롭다운.
  - [일괄등록] 버튼 노출 조건에 product 추가.
  - 일괄등록 모달: counsel 탭일 때 "범용 상담가이드" 다운로드 링크 추가, product 탭일 때
    "카탈로그 CSV는 [상품 가져오기]를 사용" + 동기화 소유 문서 덮어쓰기 주의 문구.
- i18n: 신규 키 en/es/ko/vi/ja/zh 6종 + `npm run i18n:check`.

#### 와이어프레임 — 문서 카드 툴바 (그룹 탭 = CounselInfo 선택 시)
```
┌ 문서 ─────────────────────────────────────────────────────────────────────┐
│  [카탈로그 동기화] [상품 가져오기] [일괄 다운로드 ▾] [일괄등록] [AI 가져오기] │
│                                    ┌──────────────┐  [보드에 작성] [직접 추가] │
│                                    │ CSV 다운로드  │                          │
│                                    │ XLSX 다운로드 │                          │
│                                    └──────────────┘                          │
│  [전체 2078] [CounselInfo 245] [ProductInfo 1833] [OperationInfo 0]          │
└──────────────────────────────────────────────────────────────────────────────┘
· 전체 탭: 일괄 다운로드/일괄등록 버튼 숨김(대상 그룹이 모호)
· product 탭: 두 버튼 모두 노출(일괄등록이 처음으로 product에 열림)
```

#### 와이어프레임 — 일괄등록 모달 (counsel 탭)
```
┌ 일괄등록 — CounselInfo ──────────────────────────────┐
│ ⬇ 샘플 CSV   ⬇ 샘플 XLSX   ⬇ 범용 상담가이드(CSV/XLSX) │  ← 신규
│ 필수 열: category, title, content …(기존 문구)         │
│ ⚠ 외부 소스(카탈로그·보드·노션 등)에서 동기화된 문서를   │  ← 신규
│   수정하면 다음 동기화 때 되돌아갈 수 있습니다.          │
│ [파일 선택]                                            │
│                              [닫기]      [가져오기]     │
└──────────────────────────────────────────────────────┘
```

### P4 — 샘플 + 범용 상담가이드 콘텐츠 (G4, G5)
- `apps/web/public/samples/kb-product-bulk-sample.csv/.xlsx` — generic 형식의 product 예시 3행.
- **범용 상담가이드 작성** (`universal-counsel-guide.csv` + `.xlsx`):
  - 원천: ivyusa counsel 245건 덤프(스테이징에서 취득 완료).
  - 일반화 규칙: 브랜드명·자사 프로그램(Beautizen/RoundTable/Professional/B2B 세부)·실연락처
    제거, 미국 특화 법조항은 일반 원칙으로 치환, 테스트 잔재 3건 제외.
  - 구성(안): 0.이용안내(수정 후 등록하라는 안내 1행) / 1.계정·법적고지 / 2.주문·취소 /
    3.배송 / 4.반품·교환 / 5.환불 / 6.결제 / 7.회원·포인트 / 8.프로모션·쿠폰 /
    9.클레임(오배송·파손·분실) / 10.제품안전·이상반응 / 11.부정사용 / 12.상담 응대 원칙
    — 각 주제 KO·EN 병기 행 분리, 약 30주제 × 2언어 ≈ 60행.
  - 카테고리는 ivyusa 체계 재사용(policy_shipping 등) — 업로드 시 kb_categories 자동 ensure.
  - 언어분리 검증: 같은 문서에 KO/EN 혼입 금지(go2joy 때 기준 재사용).

### P5 — 테스트·검증
- 단위: `toCsv` 이스케이프/BOM, export 서비스(테넌트·그룹·active 필터), 라운드트립
  (export→parseCsvRecords→importRecords 전행 skipped), product 그룹 import 허용.
- 수동: 로컬 부팅 검증(모듈 등록 변경) + 콘솔에서 3그룹 다운로드→수정→업로드 확인.
- 범용 가이드: 로컬 테넌트에 실제 업로드해 245규모 KB 정상 등록·재업로드 전행 skip 확인.

## 2. 측면 영향 분석

| 영역 | 영향 | 판단 |
|------|------|------|
| 기존 일괄등록 | BULK_IMPORT_GROUPS 확장 외 무변경 — counsel/operation 경로 그대로 | 안전 |
| 카탈로그 동기화 | export/import가 source를 건드리지 않음. catalog 소유 문서를 generic import로 수정하면 다음 sync가 덮어씀(기존 콘솔 편집과 동일) — 안내로 고지 | 수용 |
| 임베딩 파이프라인 | import 기존 경로 재사용(변경행만 pending→배치 임베딩) — export는 읽기 전용 | 안전 |
| RBAC/테넌트 격리 | export는 `user.tenantId`로만 조회, capability는 import와 동일 축 | 안전 |
| 위젯/AI 응답 | 없음(콘솔 전용 기능) | — |
| 배포 | 스키마 변경 없음 → SQL 선적용 불요, 코드 배포만 | 단순 |

## 3. 산출물 파일 목록(예정)

```
apps/api/src/domain/knowledge/csv.util.ts               (toCsv 추가)
apps/api/src/domain/knowledge/bulk-export.service.ts    (신규 + spec)
apps/api/src/domain/knowledge/knowledge.controller.ts   (export 라우트)
apps/api/src/domain/knowledge/knowledge.module.ts
apps/api/src/domain/knowledge/entity/kb-document.entity.ts (BULK_IMPORT_GROUPS)
apps/web/src/lib/api-client.ts                          (apiGetBlob)
apps/web/src/domain/knowledge/{knowledge.service,knowledge.hooks}.ts
apps/web/src/domain/knowledge/KnowledgePage.tsx
apps/web/src/domain/knowledge/i18n/*.json               (6개 언어)
apps/web/public/samples/kb-product-bulk-sample.{csv,xlsx}
apps/web/public/samples/universal-counsel-guide.{csv,xlsx}
docs/test/TCR-260903-… · docs/implementation/RPT-260903-…
```

## 4. 확인 필요(승인 시 함께 결정)

1. 범용 상담가이드 언어: **KO·EN 2언어**로 제안(ivyusa 원본과 동일 구성). VI 등 추가 언어는
   후속 요청 시 확장.
2. 자사 프로그램 성격의 장(Beautizen 앰배서더·RoundTable 체험단·B2B 도매)은 범용 가이드에서
   **제외**로 제안 — 쇼핑몰마다 존재 여부가 갈리는 프로그램이라 기본 제공 시 오답 유발.
   (필요 몰은 ivyusa 원본을 별도 참고 가능)

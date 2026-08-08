# TCR-260808-Console-Product-List

콘솔 상품 목록 화면 테스트 케이스.

- 작성일: 2026-08-08
- 대상: `PLN-260808-Console-Product-List.md`
- 자동화: Jest — 신규 13케이스(목록 8 + 상세/요약 5), 전체 **777 passed / 74 suites**

---

## 1. 단위 테스트 (`product.service.spec.ts`, 신규 8)

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U1 | `adminList` 기본 | `where={tenantId}` — **status 조건 없음**(보관 포함), 정렬 `status ASC, publishedAt DESC, id DESC` | ✅ |
| U2 | 상태 필터 `archived` | `where={tenantId,status:'archived'}` | ✅ |
| U3 | 상태값이 active/archived 둘 다 아님 | 무시하고 전체 조회(허용 값만 반영) | ✅ |
| U4 | 검색 + 카테고리 + 상태 동시 | title 브랜치·tags 브랜치 **양쪽 모두**에 다른 필터가 유지됨 | ✅ |
| U5 | tenantId 없는 principal | `[[],0]` — 리포지토리 호출 자체가 없음(fail-closed) | ✅ |
| U6 | `adminSummary` | total/active/archived 집계 + **가장 최근** syncedAt | ✅ |
| U7 | `adminSummary`(tenant 없음) | 0/0/0/null | ✅ |
| U8 | `knowledgeHandles` | 페이지 전체를 **1쿼리**로 해결, externalKey null 행 제외 / 빈 페이지는 쿼리 안 함 | ✅ |

## 1-1. 요약/상세 (`product.mapper.spec.ts`, 신규 5)

| ID | 케이스 | 기대 | 결과 |
|---|---|---|---|
| U9 | 100자 이하 설명 | 그대로 유지(생략부호 없음) | ✅ |
| U10 | 긴 영문 설명 | 단어 경계에서 잘리고 `…` 부착, **중간에서 잘리지 않음** | ✅ |
| U11 | 공백 없는 한국어 300자 | 100자 + `…` = 101자 (앞쪽 공백을 존중해 요약을 날리지 않음) | ✅ |
| U12 | 빈 값·공백만 | `null` | ✅ |
| U13 | 목록 매퍼 | `descriptionSnippet` 포함, **`description` 필드 자체가 없음** | ✅ |

## 2. 통합 (로컬)

| ID | 항목 | 결과 |
|---|---|---|
| I1 | `npm run typecheck` | ✅ 9/9 |
| I2 | `npm run build` | ✅ 6/6 |
| I3 | API 실기동 | ✅ `Nest application successfully started` |
| I4 | 라우트 매핑 | ✅ `summary`, `categories`, `` (GET), `:handle` (GET), `sync` (POST) — `:handle`이 **마지막** |

## 3. 스테이징 검증 (2026-08-08, tenant 3 = amoebaorder)

| ID | 케이스 | 결과 |
|---|---|---|
| S1 | `GET /admin/products/summary` | ✅ `{total:28, active:23, archived:5, inKnowledge:28, lastSyncedAt:…}` — DB 집계와 일치 |
| S2 | `GET /admin/products/categories` | ✅ `기타·립·소품·아이·페이스·향수` (보관 행 포함 집계) |
| S3 | `GET /admin/products?page=1&size=3` | ✅ pagination `{page,size,totalCount:28,totalPages:10,hasNext}`, 각 행에 category·status·inKnowledge·몰 링크 |
| S4 | 상태 필터 `status=archived` | ✅ 5건, 전부 archived |
| S5 | 검색 `q=향수` | ✅ 4건 — **제목에 "향수"가 없는데도** 태그 브랜치로 회수(검색이 태그까지 본다는 증거) |
| S6 | **테넌트 격리** — tenant 1 토큰으로 조회 | ✅ ivyusa 2,275건만, Cafe24 행 미노출 |
| S7 | 신규 화면 번들 반영 | ✅ web 컨테이너 자산에서 신규 i18n 키 확인 |

## 3-1. 상세보기·요약 스테이징 검증 (2026-08-08)

| ID | 케이스 | 결과 |
|---|---|---|
| S8 | 목록 응답 | ✅ `descriptionSnippet` 존재, **`description` 필드 미포함**(페이로드 축소 확인) |
| S9 | `GET /admin/products/cafe24-33` | ✅ 전문(71자)·sku `P00000BH`·태그·syncedAt·`inKnowledge:true` |
| S10 | 정적 라우트 가림 여부 | ✅ `summary` 200, `categories` 200 — `:handle`에 먹히지 않음 |
| S11 | 없는 handle | ✅ 404 |
| S12 | **100자 자르기 실데이터**(ivyusa) | ✅ 97자 + `…`, `"These medium…"` — 단어 경계에서 잘림(파일럿 몰은 설명이 71자라 미검증 구간이었음) |

## 3-2. 브라우저 육안 확인 (2026-08-08, tenant 1 ivyusa 2,275건)

| ID | 케이스 | 결과 |
|---|---|---|
| B1 | 사이드바 진입 | ✅ 지식 다음에 "상품" 노출, `/products` 이동 |
| B2 | 요약 카드 | ✅ 2275 / 2274 / 1 / 1833 · 2275 + 마지막 동기화 시각 |
| B3 | 목록 렌더 | ✅ 썸네일·상품명·100자 요약(2줄)·카테고리·가격·상태 뱃지 |
| B4 | **지식 열** | ❌→✅ **1568px에서 화면 밖으로 잘려 접근 불가**(D9) → 수정 후 정상 노출 |
| B5 | **필터 3종** | ❌→✅ **각각 전체 너비로 세로 3줄**(D10) → 수정 후 한 줄 정렬 |
| B6 | 상태 필터 = 보관됨 | ✅ 1건, `보관됨` 회색 뱃지, 카테고리 `—`, 페이지네이션 `1–1 of 1` |
| B7 | 검색 + 상태 조합 | ✅ "lip oil" + 판매중 → Lip Balms 결과만 |
| B8 | 행 클릭 → 상세 | ✅ 다이얼로그: 이미지·판매중/등록됨·가격·쇼핑몰 링크·카테고리·브랜드·태그·SKU·키·등록일·동기화·전문 |
| B9 | 긴 전문 스크롤 | ✅ 모달 내부 스크롤로 전문 확인 |
| B10 | 한국어 UI | ✅ 상품/전체 상품·판매중·보관됨·지식 등록/전체 카테고리/판매중·등록됨/상세 내용 등 전부 번역 |
| B11 | Esc 닫기 | ✅ |

### 여기서만 드러난 결함 2건 (PR #186, 수정·재배포 완료)

| # | 결함 | 원인 |
|---|---|---|
| D9 | 지식 열이 잘려 **접근 불가** | 공용 `Table` 래퍼가 `overflow-hidden` → 컨테이너보다 넓은 표는 오른쪽 열이 가로 스크롤도 없이 소실. `overflow-x-auto`로 바꾸고 상품 셀을 460px로 제한 |
| D10 | 필터가 세로로 쌓임 | `Input`/`Select`가 공용 base에서 `w-full`을 달고 오는데 `cn`은 단순 join(테일윈드 병합 없음) → 컨트롤에 준 `w-auto`가 짐. 폭을 래퍼로 이동 |

**교훈**: API 검증(S1~S12)은 전부 통과했는데도 화면에서는 **핵심 열이 아예 보이지 않았다**. 응답이 맞다는 것과 화면에 보인다는 것은 별개다.

## 4. 남은 확인

- ivyusa 2,275건 화면 체감 성능: 목록·필터·상세 모두 즉시 응답(체감 지연 없음). 정량 측정은 미실시.
- Cafe24 테넌트(amoebaorder) 화면은 계정 비밀번호가 없어 미확인 — 데이터는 API로 검증했고(S1~S12), 화면 로직은 테넌트 무관이다.

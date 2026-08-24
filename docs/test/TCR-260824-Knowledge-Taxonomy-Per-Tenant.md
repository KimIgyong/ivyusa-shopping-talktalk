# TCR-260824-Knowledge-Taxonomy-Per-Tenant

지식 분류 체계의 테넌트화 — 테스트 케이스

- 근거: `REQ-260824` / `PLN-260824`
- 대상: PR #341(구현) · #342(origin 판정) · #343(라우트 충돌) · #344(미리보기 문구)

## 1. 단위 테스트 (자동, 1,469건 전체 통과)

### 1-1. 유형 매칭 (`usage-guide.service.spec.ts`, 18건)
| ID | 케이스 | 기대 |
|---|---|---|
| U-1 | 8종 상품명 분류 | 각 유형으로 정확히 매칭 |
| U-2 | `Lash Adhesive Strip Lash Glue` | `lash_adhesive` — 포함관계에서 좁은 쪽이 이김 |
| U-3 | 팔찌·화장솜 | `null` — 가이드가 도움 안 되는 상품 |
| U-4 | 제목이 무의미할 때 category·tags 폴백 | 매칭됨 |
| U-5 | 목록에 없는 유형으로 가이드 저장 | **거부**(테넌트 목록 대조) |

### 1-2. 유형 관리 (`usage-type.service.spec.ts`, 13건)
| ID | 케이스 | 기대 |
|---|---|---|
| T-1 | 라벨 → 키 슬러그 | `Care & storage` → `care_storage` |
| T-2 | 키 충돌 | `care_storage_2` — 접미사, 덮어쓰기 없음 |
| T-3 | 비ASCII 라벨(`립 메이크업`) | `type` 폴백 — 빈 키를 만들지 않음 |
| T-4 | 빈 줄 키워드 | 제거 — 빈 키워드는 전부 매칭시킴 |
| T-5 | 신규 유형 위치 | 맨 아래(`sortOrder` 최대+10) — 기존 분류를 흔들지 않음 |
| T-6 | 라벨 변경 | **키 불변** — `usage:{key}` 고아화 방지 |
| T-7 | 미리보기 개수·예시 | 걸리는 수와 상품명 |
| T-8 | 위 순서 유형이 가져간 것 차감 | 실제로 받을 수만 표시 |
| T-9 | **0개인데 다른 유형이 가져감** | `takenByOthers`·`takenBy` 반환 |
| T-10 | 신규 테넌트 시딩 | 중립 3종, 키워드 없음 |
| T-11 | 이미 유형이 있는 테넌트 | 시딩 no-op |

### 1-3. 카테고리 관리 (`kb-category.service.spec.ts`, 13건)
| ID | 케이스 | 기대 |
|---|---|---|
| C-1 | 문서 수 집계 출처 | 테이블이 아니라 **문서**에서 — 옮겨진 카테고리는 0 |
| C-2 | 행 없는 문자열 | `unregistered:` 행으로 **노출**(숨기지 않음) |
| C-3 | 이름 변경 | 행 + 문서가 **한 트랜잭션** |
| C-4 | 카탈로그 파생 이름 변경 | **거부** — 다음 동기화가 되돌려 씀 |
| C-5 | 기존 이름으로 변경 | 거부 — 그건 병합이며 선택 안 한 문서가 움직임 |
| C-6 | 병합 | 문서 이동 + 빈 행 삭제 |
| C-7 | 대상이 소스 목록에 포함 | 무시 |
| C-8 | 문서 있는 카테고리 삭제 | 거부 |
| C-9 | `ensure()` 신규 | `origin` 태그와 함께 등록 |
| C-10 | `ensure()` 동일 origin | no-op |
| C-11 | **manual 행에 동기화가 문서를 씀** | `catalog`로 **승격** |
| C-12 | catalog 행에 사람이 문서를 씀 | **강등 안 함** |

## 2. 배포 검증 (스테이징 실행, 2026-08-24)

| ID | 확인 | 결과 |
|---|---|---|
| S-1 | SQL 선적용 | `usage_types` 10행(tenant 1), `kb_categories` **85행** = 사전 측정한 (테넌트,카테고리) 85쌍과 일치 |
| S-2 | 유형 키 보존 | `lash_adhesive,lashes,press_on_nails,…` 순서·키 그대로 |
| S-3 | origin 판정 | manual 46 / catalog 39. **이중 사용 2건 교정**(`Kiss New York` 135+26, `MJCARE` 1+3 → catalog) |
| S-4 | API 부팅 | `Nest application successfully started`, DataSource 오류 없음 |
| S-5 | 신규 라우트 | `/knowledge/usage-types` `401`, `/knowledge/categories` `401` |
| S-6 | **응답 내용** — usage-types | 10종, 라벨·키워드 수·순서 정상 |
| S-7 | **응답 내용** — categories | 63행, `{name, origin, documentCount}` |
| S-8 | `categories/counts` | 기존 리포트 형태 유지 |
| S-9 | `PUT usage-types/reorder` | `{reordered:0}` — 파라미터 라우트에 안 먹힘 |
| S-10 | 카탈로그 파생 이름 변경 | **HTTP 400** |
| S-11 | 가이드 라벨 출처 | 데이터에서(`Lash adhesive` 45 · `Lashes` 287 · `Press-on nails` 330) |
| S-12 | 미리보기 — 점유됨 | `matched 0 / takenByOthers 209 / takenBy "Press-on nails"` |
| S-13 | 미리보기 — 진짜 무매칭 | `matched 0 / takenByOthers 0 / takenBy null` |
| S-14 | 콘솔 번들 | `takenByOthers` 포함(`KnowledgePage-mSYcqUuc.js`) |

## 3. 수동 스모크 (남음 — 사람 필요)

| ID | 시나리오 | 확인할 것 |
|---|---|---|
| M-1 | `/knowledge` 유형 추가 | 모달, 키워드 입력 중 개수가 갱신되는지 |
| M-2 | 키워드를 기존 유형과 겹치게 입력 | "위에 있는 X가 가져갑니다" 문구가 뜨는지 |
| M-3 | ↑↓로 순서 변경 | 저장 후 목록·분류 개수가 함께 바뀌는지 |
| M-4 | 유형 끄기 | 가이드 본문이 남는지, 분류에서 빠지는지 |
| M-5 | 카테고리 카드 | 내가 만든 것/카탈로그 2단 구분, 🔒 표시 |
| M-6 | 이름 변경 | 문서 수 안내 문구, 목록·문서 필터 동시 반영 |
| M-7 | 병합 | 체크 다중 선택 → 이동 건수 토스트 |
| M-8 | 6개 언어 전환 | 신규 39키가 각 언어로 보이는지(vi/ja/zh는 β) |
| M-9 | 상품 0개 테넌트(go2joy) | "카탈로그가 없어 개수는 0" 안내 |

## 4. 회귀 확인
- 기존 1,466건 + 신규 3건 = **1,469건 전체 통과**
- `catalog-sync.service.spec.ts` · `tenant.service.spec.ts` — 생성자 변경으로 갱신, 동작 단언은 유지
- ivyusa 분류 결과 무회귀: 배포 후 `Lashes 287` · `Press-on nails 330`이 구현 전 로컬 측정치와 동일

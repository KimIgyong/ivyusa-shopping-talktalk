# REQ-260821-Knowledge-Notion-Source

지식 소스에 노션(Notion) 연동 추가 — 요구사항 분석

- 요청일: 2026-08-21
- 요청 요지: `/knowledge` 지식 소스 추가에서 **노션을 소스로 등록**해 노션 문서를 KB로 수집할 수 있어야 한다.

## 1. AS-IS

### 1.1 지식 소스 프레임워크 (S1 게시판 · S2 구글드라이브 기구축)
- `knowledge_sources` 테이블: `type varchar(16)`, `config_json`, 동기화 상태 3컬럼(`last_sync_at/status/result`) — 별도 상태 테이블 없음.
- **어댑터 레지스트리**: `SourceSyncService`가 어댑터를 주입·등록(`supportedTypes()`), 콘솔은 어댑터 없는 타입을 "준비중"으로 표시. 어댑터 계약은 `type` / `trustEmptyListing` / `validateConfig()` / `fetchAll()` 4멤버(`SourceItem = {externalKey,title,content,sourceUrl,category}`).
- **공유 파이프라인**(`source-sync.service.ts`): 전체 목록 대조(create/update/skip/hide), 미임베딩 문서 재큐잉, 숨김 문서 복귀, **빈 목록 가드**(`trustEmptyListing=false` 어댑터가 0건 반환 + 기존 문서 존재 → hide 중단, `failed`로 기록 — 공유 끊김을 빈 워크스페이스로 오인하지 않기 위함). 문서는 삭제 아닌 숨김. 동기화는 수동(`POST /knowledge/sources/:id/sync`), 크론 없음.
- **gdrive 자격증명**: 공용 `integration_credentials(tenant_id, provider)`에 AES-256-GCM 암호화 저장(서비스계정 email+private_key만), `GET/PUT/DELETE /knowledge/gdrive/credential` + `POST /knowledge/gdrive/test`(오류 원인 구분: 잘못된 키 vs 폴더 미공유 — 둘 다 "0 files"로 보이는 함정 대응).
- gdrive 콘텐츠 추출은 구글 서버측 export(`text/plain`) — **자체 파싱 없음**, 폴더 직계 자식만(비재귀).

### 1.2 KB 문서 파이프라인 제약
- `title 255 / category 64 / external_key 255 / source_url 512` 컬럼 상한(어댑터가 넘기면 DB 에러 — 현재 미가드), 임베딩 입력 30,000자 슬라이스, `doc_group=COUNSEL`·`source='knowledge_store'`는 파이프라인 하드코딩(어댑터가 못 바꿈).
- 임베딩은 sync 밖에서 배치(64), Voyage+Qdrant, 스텁 벡터 수용 거부.

### 1.3 노션 관련 기존 코드
- **전무**(greenfield). `INTEGRATION_PROVIDER`에 notion 없음.
- ⚠️ 로컬 main 체크아웃은 origin/main보다 뒤처져 gdrive 코드가 없음 — 구현은 반드시 origin/main 기준 워크트리에서.

## 2. TO-BE

1. **소스 타입 `notion` 추가**: `/knowledge` 소스 추가 모달에서 노션 선택 → 대상 ID(데이터베이스 또는 페이지) 입력 → 등록.
2. **인증 = 노션 내부 통합(Internal Integration) 토큰** — 테넌트당 1개, gdrive 서비스계정과 동일한 모델(OAuth 플로우 없음): 운영자가 자기 워크스페이스에서 통합 생성 → 대상 DB/페이지를 통합에 공유(connect) → 토큰(`ntn_…`/`secret_…`)을 콘솔에 등록(암호화 저장).
3. **수집 규칙** (gdrive의 "폴더 직계 자식" 대응):
   - 대상이 **데이터베이스** → 각 행(row) 페이지 = KB 문서 1건
   - 대상이 **페이지** → 그 페이지 자체 + 직계 자식 페이지 = 각 1건 (1단계, 비재귀 — gdrive와 동일한 flat 원칙)
   - 페이지 본문은 **블록 트리 → 평문 변환**(신규 유틸): 문단/헤딩/리스트/토글/인용/콜아웃/코드/표, 리치텍스트 평문화, 중첩 깊이 상한. 이 변환기가 유일한 순수 신규 로직.
4. **연결 테스트**: 토큰 유효성(`/v1/users/me`)과 "대상이 통합에 공유됐는가"를 구분해 안내 — gdrive의 "0 files" 함정과 동일한 문제의 노션판.
5. **안전장치**: `trustEmptyListing=false`(통합 공유 해제 = 빈 목록 → 기존 문서 숨김 금지), 레이트리밋 준수(노션 ~3 req/s — 클라이언트 스로틀), 페이지 수 상한 시 결과 JSON에 드롭 수 기록(무음 절단 금지), title/category 등 컬럼 상한 어댑터 절단.

### 범위 제외 (적정기술)
- OAuth 공개 통합(마켓플레이스형) — 내부 통합 토큰으로 충분, 파트너 심사·리다이렉트 인프라 불필요.
- 재귀 수집(하위의 하위 페이지), 이미지/파일 블록, 주기 자동 동기화(크론) — 기존 소스들과 동일하게 수동 sync. 필요 시 후속.
- 공유 파이프라인의 `source='knowledge_store'` 하드코딩 변경(전 어댑터 영향) — 현행 유지, 백로그.

## 3. 갭 분석

| # | 갭 | 대응 |
|---|-----|------|
| G1 | notion 클라이언트 없음 | `notion.client.ts` — fetch 전용(SDK 無, gdrive 방침 동일), `Notion-Version` 헤더, 커서 페이지네이션(`start_cursor/has_more`), ~3req/s 스로틀 |
| G2 | 블록→텍스트 변환기 없음 (**최대 신규 작업**) | `notion-block-text.util.ts` + 단위 테스트 — 블록 타입별 평문화, 깊이·문자 상한 |
| G3 | 자격증명 저장/테스트 없음 | `notion-credential.service.ts` — `integration_credentials(provider='notion')`, 암호화·test() 재사용 패턴 |
| G4 | 어댑터/레지스트리 미등록 | `notion.adapter.ts` + enum 3곳(`KNOWLEDGE_SOURCE_TYPE`·DTO `@IsIn`·웹 드롭다운) + 모듈 등록 |
| G5 | 소스 생성 시 자격증명 프리체크가 gdrive 하드코딩 | 어댑터 인터페이스에 `credentialProvider?` 얹어 일반화(gdrive 분기 제거) |
| G6 | 콘솔 UI/훅/i18n 없음 | 모달 notion 분기, 자격증명 카드(gdrive 카드 소형 공용화), 서비스·훅, i18n 6개 언어 |

**마이그레이션 불필요**: `provider varchar(32)`·`type varchar(16)`에 'notion' 수용, 토큰은 `VARBINARY(4096)`에 여유.

## 4. 사용자 흐름

1. 운영자: notion.so/my-integrations에서 내부 통합 생성 → 대상 데이터베이스/페이지 우측 메뉴 "연결(Connections)"에 통합 추가 → 토큰 복사.
2. `/knowledge` → 노션 토큰 카드에 토큰 등록(→ 연결 테스트) → "지식 소스 추가" → 유형 노션, 대상 ID 입력(URL 붙여넣기 시 ID 자동 추출) → 등록.
3. 소스 행의 동기화 버튼 → 페이지들이 KB 문서로 수집·임베딩 → 위젯 답변 인용에 노션 문서(원본 링크 `sourceUrl`) 등장.
4. 노션에서 페이지 수정 → 재동기화 시 갱신, 페이지 삭제 → 숨김, 통합 공유 해제 → **가드 발동**(숨김 대신 실패 표시).

## 5. 제약·전제

- C1. 노션 API 버전 고정 헤더(`Notion-Version: 2022-06-28`) — 무헤더 요청은 거부됨.
- C2. 레이트리밋 평균 3 req/s — 목록 1 + 페이지당 블록 조회 N이므로 스로틀 필수. 1회 sync 페이지 상한(기본 200) + 초과분은 결과에 기록.
- C3. 아카이브(`archived: true`) 페이지는 제외(gdrive의 `trashed=false` 대응).
- C4. 실 E2E는 **사용자 노션 워크스페이스의 통합 토큰 필요** — 개발·단위·모킹 검증까지는 자체 수행, 실토큰 검증은 토큰 수령 후(스테이징 gdrive와 동일한 상황: 실계정 미검증 잔여).
- C5. 구현 기준은 origin/main (로컬 체크아웃 95커밋 뒤처짐 — gdrive 코드 부재).

## 6. 에러코드

gdrive는 전용 Exxxx 없이 `VALIDATION_FAILED`+상세 메시지/`EXTERNAL_SERVICE_ERROR`로 처리 — 노션도 동일 방침(신규 블록 불필요). 구현 시 재확인.

## 7. 결론

gdrive 어댑터의 구조·안전장치를 그대로 계승하고, 순수 신규는 ①노션 클라이언트(커서 페이지네이션+스로틀) ②블록→텍스트 변환기 두 가지. 스키마 변경 없음. 상세 단계·와이어프레임은 `PLN-260821-Knowledge-Notion-Source.md`.

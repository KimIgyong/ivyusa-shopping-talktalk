# PLN-260821-Knowledge-Notion-Source

지식 소스 노션 연동 — 구현 계획

- 근거: `docs/analysis/REQ-260821-Knowledge-Notion-Source.md`
- 원칙: gdrive 어댑터 세트 미러링(구조·안전장치 계승), SDK 없이 fetch, 스키마 변경 없음, 공유 파이프라인 무수정.

## 0. 설계 요약

```
자격증명: integration_credentials(provider='notion') — 내부 통합 토큰 AES-256-GCM
소스 config_json: { targetId }  ← 데이터베이스/페이지 ID (URL 붙여넣기 자동 추출)
수집: DB → 행 페이지들 / 페이지 → 본인+직계 자식 페이지 (flat, 비재귀)
본문: blocks.children 커서 순회 → notion-block-text.util 평문화(깊이≤3, 30k 상한)
가드: trustEmptyListing=false · 스로틀 350ms/req · 페이지 상한 200(초과 기록) · 컬럼 상한 절단
```

## 1. 단계별 계획

### W1 — 백엔드 (PR 1)
- `apps/api/src/domain/knowledge/notion.client.ts` (fetch 전용):
  - 공통 요청 래퍼: `Authorization: Bearer`, `Notion-Version: 2022-06-28`, **최소 간격 350ms 스로틀**, 429 시 `Retry-After` 존중 1회 재시도, 오류는 노션 메시지 200자 절단 전달(`NotionAuthError`/`NotionRequestError` — gdrive 오류 타입 대응)
  - `me()` (`GET /v1/users/me` — 토큰 검증), `retrieveTarget(id)` (databases→pages 순 판별), `listDatabasePages(id)` (`POST /v1/databases/{id}/query` 커서 순회, archived 제외), `listChildPages(id)` (`GET /v1/blocks/{id}/children` 중 `child_page`), `pageBlocks(id)` (커서 순회 + 중첩 `has_children` 1~3단계)
- `notion-block-text.util.ts` (**단위 테스트 필수** — 유일한 순수 신규 로직):
  - rich_text 배열 → plain_text 결합; paragraph/heading_1~3/bulleted·numbered_list_item/quote/callout/toggle/code/table_row/divider/to_do 평문화(헤딩 `#`, 리스트 `-`, 코드 펜스), 미지 블록 타입은 무시(로그 카운트), 깊이 상한 3, 결과 30,000자 절단
- `notion-credential.service.ts`: gdrive 크레덴셜 서비스 미러 — save(암호화)/get(마스킹: 끝 4자)/delete/`test(targetId?)` — 토큰 무효(401)와 대상 미공유(404 object_not_found)를 **구분 메시지**로
- `adapters/notion.adapter.ts`: `type='notion'`, `trustEmptyListing=false`, `validateConfig`(URL이면 ID 추출, 32-hex/UUID 검증), `fetchAll()` — 대상 판별→페이지 목록(상한 200, 초과 수 결과 기록)→본문 변환→`SourceItem[]`(externalKey `page:{id}`, title 255·category 64 절단, sourceUrl = notion.so 링크)
- 배선: `KNOWLEDGE_SOURCE_TYPE.NOTION` + `INTEGRATION_PROVIDER.NOTION`(packages/types), DTO `@IsIn`+`SaveNotionCredentialRequest`/`TestNotionRequest`, 모듈 등록, `knowledge.controller.ts`에 `notion/credential`(GET/PUT/DELETE)+`notion/test` 4라우트(동일 capability)
- **프리체크 일반화(G5)**: `SourceAdapter`에 `credentialProvider?: string` 추가 → `knowledge.service.ts`의 gdrive 하드코딩 분기를 어댑터 선언 기반으로 교체(gdrive 어댑터에 `credentialProvider='google_drive'` 선언 — 동작 불변)
- 테스트: block-text 유틸(블록 타입별·중첩·절단), adapter(validateConfig·상한 절단·빈 목록), credential(test 구분), client 스로틀은 시간 모킹 1건

### W2 — 콘솔 UI (PR 2)
- `KnowledgePage.tsx`: `SOURCE_TYPES`에 notion, 모달 notion 분기(대상 ID 입력 + URL 자동 추출 + "노션에서 통합에 대상을 공유(Connections)했는지" 콜아웃 + 토큰 미등록 시 안내)
- 자격증명 카드: gdrive 카드를 소형 공용 컴포넌트 `SourceCredentialCard`로 추출해 gdrive/notion 2회 사용(중복 복붙 방지 — 표시명·마스킹 값·테스트 버튼·삭제 확인을 props로)
- `knowledge.service.ts`/`knowledge.hooks.ts`: notionCredential/save/delete/test 4종 (쿼리 키 `['knowledge', tenantKey, 'notion-credential']`)
- i18n 6개 언어: `notionCredential/Connected/NotConnected/KeyHint/RemoveConfirm`, `notionTargetId/Hint`, `shareWithIntegration`, `registerTokenFirst` 등 + `npm run i18n:check`
- 토스트(성공 자동/실패 수동) — 기존 훅 패턴 재사용

### W3 — 배포·검증 + 문서 (PR 3=docs)
- 스테이징 배포(스키마 변경 없음 → SQL 선적용 불필요, 배포 검증 3종)
- 단위·모킹 검증 + 스테이징에서 **미지 토큰/미공유 오류 경로** 실검증
- **실 워크스페이스 E2E는 사용자 의존(C4)**: 사용자가 노션 내부 통합 생성·대상 공유·토큰 제공 시 → 소스 등록·sync·위젯 인용까지 확인. 토큰 수령 전까지 TCR 해당 항목은 '대기'로 명시
- TCR-260821 + RPT-260821, 메모리 갱신

## 2. UI 와이어프레임 (필수)

```
/knowledge  지식 소스 영역
┌──────────────────────────────────────────────────────────┐
│ 자격증명 카드 (공용화)                                     │
│ ┌──────────────────────┐  ┌──────────────────────┐       │
│ │ Google Drive          │  │ Notion               │       │
│ │ 연결됨: sa@…iam…      │  │ 미등록               │       │
│ │ [키 등록] [테스트][삭제]│  │ 토큰 [ntn_········ ] │       │
│ └──────────────────────┘  │ [등록] [연결 테스트]   │       │
│                            └──────────────────────┘       │
│ [+ 지식 소스 추가]                                         │
└──────────────────────────────────────────────────────────┘

소스 추가 모달 (유형=노션 선택 시)
┌──────────────────────────────────────────┐
│ 이름   [노션 운영 매뉴얼            ]      │
│ 유형   (노션 ▼)                           │
│ 대상   [https://notion.so/…-abc123… ]     │
│        └ URL을 붙여넣으면 ID만 저장됩니다   │
│ ⓘ 노션에서 대상 페이지/DB의 ⋯ → 연결에     │
│   이 통합을 추가해야 목록이 보입니다.       │
│ (토큰 미등록 시) ⚠ 먼저 노션 토큰을 등록    │
│        [취소]  [등록]                      │
└──────────────────────────────────────────┘
```

## 3. 사이드 임팩트 분석

| 영역 | 영향 | 대응 |
|------|------|------|
| 기존 board/gdrive 소스 | 프리체크 일반화(G5)로 코드 경로 변경 | gdrive 어댑터에 `credentialProvider` 선언 — 동작 동일, 기존 스펙으로 회귀 확인 |
| 공유 sync 파이프라인 | 무수정 (source='knowledge_store' 하드코딩 유지) | 어댑터 내부에서만 처리; 파이프라인 개편은 백로그 |
| DB 스키마 | 변경 없음 | PR에 Migration 섹션 "해당 없음" 명기 |
| gdrive 자격증명 카드 | 공용 컴포넌트로 추출 | 표시·동작 불변 리팩터, 스테이징에서 gdrive 카드 회귀 확인 |
| 레이트리밋 | sync 소요 증가(200페이지≈70s+) | 상한·스로틀 문서화, 결과 JSON에 소요·드롭 기록 |

## 4. 리스크

- R1. 노션 API 버전 변경/블록 타입 다양성 → 미지 블록은 무시+카운트(무음 실패 방지), 버전 헤더 고정.
- R2. 대형 워크스페이스 sync 장시간 → 페이지 상한 200 + 결과 기록(운영자 인지), 필요 시 상한 설정화 후속.
- R3. 실토큰 E2E 지연(C4) → 모킹+오류 경로 검증으로 선배포, 토큰 수령 즉시 잔여 E2E.

---
**승인 요청**: 본 PLN 승인 시 W1부터 구현 착수. 실 워크스페이스 E2E를 위해 노션 **내부 통합 토큰**(및 공유된 테스트 DB/페이지 1개)을 주시면 W3에서 끝까지 검증합니다 — 없으면 해당 항목만 '대기'로 남깁니다.

# AN — 미국 자사몰 통합 정책서 → ShopTalk 지식(KB) 등록 방안

- 작성일: 2026-07-31
- 대상 문서: Google Docs 「1차~3차) 미국 자사몰 통합 정책서 / TALK TALK CHAT-BOT Policy & Front Response Guide V3」
  (docId `1QIJjQMIwz6WkAdMmOJmECgBrDpxUtrpilFeuclQKeKc`)
- 목적: 위 정책 문서를 ShopTalk(IVY USA Chat & Support Widget)의 챗봇 지식으로 등록하기 위한
  현황 분석·등록 방안·실행 방법 정리

---

## 1. 대상 문서 분석

문서는 탭 7개로 구성되며, 앞쪽 탭(1차/2차/3차/탭4)은 목록·검토 이력이고
**최종본은 마지막 두 탭**이다.

| 탭 | 내용 | 용도 |
|---|---|---|
| 1차) 정책서 목록 | 16개 분류의 정책 마스터 인덱스 | 참고용 |
| 2차) 목록 및 현재 운영정보 | 목록 + 현행 운영값(배송비 등) | 참고용 |
| 3차) 목록 V3 / Copy / 탭4 | TALK TALK CHAT-BOT INFORMATION 검토본 | 참고용 |
| **KR) TALK TALK CHAT-BOT** | 한국어 최종 본문 (약 1,900행) | **등록 원본** |
| **ENG) TALK TALK CHAT-BOT** | 영어 최종 본문 (KR과 동일 구조) | **등록 원본** |

최종본(KR/ENG) 구조 — 챗봇 지식화에 적합한 형태로 이미 작성되어 있음:

- 12개 대분류: 0. AI 답변 기본 기준 / 1. 웹사이트 공통 정책 / 2. B2C(배송·반품·환불·취소·클레임·결제·프로모션) /
  3. 회원·리워드 / 4. Beauty Professional·학생 / 5. Beautizen / 6. RoundTable / 7. B2B·도매 /
  8. 제품 안전·이상반응 / 9. 부정이용 방지 / 10. AI 챗봇 운영정책 / 11. FAQ·지식자료 기준 / 12. 정책 충돌·미확정
- 중분류(`##`) 약 67개, **세부 정책 항목(`###`) 약 80개** — 언어별 동일 구조
- 각 세부 항목에 정책 본문 + **“기본 답변(Default AI response)”** + 프론트 버튼/상담 연결 기준 포함

### 등록 시 문서 측 유의사항
1. **§12 「즉시 확인해야 할 정책 충돌 및 미확정 항목」** — 등록 대상이 아니라 *등록 전 해소해야 할 목록*.
   문서 오너 확정 전 해당 항목 관련 정책은 등록 보류 또는 §0.4(미확정 안내) 기준으로 처리.
2. **§0(답변 기본 기준)·§10(AI 챗봇 운영정책)** — “지식”이 아니라 **행동 규칙**(처리 완료 표현 금지,
   상담 연결 기준 등). `kb_documents`가 아닌 **테넌트 페르소나/응답 규칙**(`tenant_ai_settings`,
   `AiConfigService.getPersonaRules`)에 반영해야 함.
3. §11.2 상품 지식자료는 별도 체계(상품별 등록)로 명시되어 있음 — 이번 범위(정책)와 분리.
4. 탭4에 운영 결정이 일부 반영됨(예: Beautizen “준비중” 안내, B2B 디테일 미확정) — KR/ENG 최종본과
   대조하여 최신 결정 반영 필요.

---

## 2. ShopTalk KB 서브시스템 현황 (as-is)

### 저장 구조
- `kb_documents` (`apps/api/src/domain/knowledge/entity/kb-document.entity.ts`):
  `tenant_id`(null=전역) · `category` varchar(64) · `title` varchar(255) · `content` LONGTEXT ·
  `active` · `status`(pending→embedded) · `embedding_ref`
- **language 컬럼 없음**, 벡터/임베딩 없음(`embed()`는 `emb_{id}` 문자열만 기록), 청킹 없음 —
  **1 row = 1 검색 단위**
- 검색은 **MySQL FULLTEXT(ngram)** `MATCH(title, content)` 자연어 검색
  (`apps/api/src/domain/chat/rag.service.ts:60`)

### RAG 파이프라인 제약 (등록 설계에 직결)
- 검색 결과 **상위 4건 × 각 400자 스니펫**만 프롬프트에 투입 (`rag.service.ts:78`) →
  **항목당 앞 400자 안에 핵심(기본 답변·수치)이 들어가야 함**
- confidence는 유사도가 아닌 **검색 건수 기반**(1건이면 0.62 > 이관 임계 0.45) —
  잘못된 문서가 1건이라도 걸리면 상담 이관이 억제됨 → 문서 품질·단위 분리가 중요
- `session.language`(EN/ES/KO)는 **응답 생성 언어에만** 반영, 검색에는 미반영 —
  한국어 질의는 한국어 콘텐츠에만, 영어 질의는 영어 콘텐츠에만 매칭됨

### 등록(인제스천) 경로 현황
| 경로 | 상태 |
|---|---|
| `POST /api/v1/knowledge/documents` (단건) | **동작함**. `KNOWLEDGE_SOURCE_MANAGE` 권한(테넌트 MASTER/DIRECTOR JWT) 필요. body 100KB 제한 |
| 시드 러너 (`seed.runner.ts:149-170`) | 동작하나 TS 하드코딩 배열. title 기준 멱등 upsert 패턴은 재사용 가치 있음 |
| 관리자 웹 UI (`/knowledge`) | **사실상 고장** — DTO 불일치(`category` 누락, `source_id`/`type` 케이스·enum 불일치)로 생성 400 |
| 벌크 API / 파일 업로드 / CSV / Google Drive 동기화 | **없음** (`gdrive`는 타입 문자열만 존재) |

### 사전 조치 필요 사항(버그/갭)
1. `docker/init-sql/01-schema.sql`에 **ngram FULLTEXT 인덱스 누락**(`sql/01-schema.sql`에는 있음) —
   해당 스키마로 만든 DB에서는 LIKE 폴백으로 한국어 검색 품질 저하. 스테이징/개발 DB에
   `ft_kb_title_content` 인덱스 존재 확인 후 없으면 ALTER 적용.
2. `createDocument`가 `active:1` 강제 → **등록 즉시 챗봇에 노출**. 대량 등록 시 검수 전 노출 위험.
3. `knowledge_sources.designated/status`가 검색 스코프에 미반영 — 소스 비활성화로는 노출 차단 불가.
4. `(tenant_id, title)` 유니크 제약 없음 — 멱등성은 애플리케이션(스크립트)에서 title 기준으로 보장해야 함.

---

## 3. 등록 방안 (to-be)

### 3.1 등록 단위·형식 (권장)
- **단위**: 세부 정책 항목(`###`) 1개 = `kb_documents` 1 row. 언어별 약 80건 → **KR+EN 합계 약 160건**
- **title**: `"{번호} {항목명}"` 예: `2.1.3 배송비` / `2.1.3 Shipping Rates and Free Shipping Thresholds`
  (255자 제한 유의)
- **content 구성 순서**: ① 기본 답변(문서에 명시된 Default AI response) ② 핵심 수치·조건
  ③ 상세 정책 본문 ④ 페이지 버튼/상담 연결 기준 — *400자 스니펫 제약 때문에 ①②를 반드시 앞에*
- **category 매핑**(varchar 자유 문자열, 기존 값: policy/faq/product/warranty):
  대분류 기준 `policy_shipping` / `policy_return` / `policy_payment` / `policy_membership` /
  `policy_beautizen` / `policy_roundtable` / `policy_b2b` / `policy_safety` / `policy_fraud` 등으로 세분 권장
- **언어 전략**: language 컬럼이 없으므로 **KR row / EN row 분리 등록**(검색이 언어별로만 매칭되므로
  병합·단일언어 등록은 한쪽 언어 질의에서 검색 실패). ES는 현재 원문이 없으므로 세션 언어 기반
  AI 현지화에 위임. *중기 과제: `kb_documents.language` 컬럼 추가 + 검색 시 세션 언어 필터.*

### 3.2 등록 방법 — 3가지 옵션

**옵션 A. 파싱 스크립트 + 기존 단건 API 루프 (무개발·즉시 실행) — 단기 권장**
1. Google Docs 내보내기(markdown/text) → 파서 스크립트가 `###` 단위로 분해,
   `{category, title, content}` JSON 생성 (KR/EN 각각)
2. MASTER 계정 JWT로 `POST /api/v1/knowledge/documents` 약 160회 호출
   (rate limit 600req/60s 내 여유, body 100KB 제한도 항목 단위라 무관)
3. 멱등성: 사전 `GET /knowledge/documents`로 기존 title 대조 후 신규만 생성, 변경분은 PATCH
4. 검수 흐름: 등록 직후 PATCH로 `active:0` 일괄 처리 → 검수 완료 후 `active:1` 활성화

**옵션 B. 벌크 임포트 기능 개발 (소규모 개발) — 운영 표준화 권장**
- `POST /api/v1/knowledge/documents/bulk` (배열 수용, title 기준 upsert, `active` 지정 허용)
  + `main.ts` bodyParser limit 상향(예: 5MB)
- 관리자 웹 `/knowledge`에 파일(JSON/MD) 임포트 UI 추가 — 기존 UI의 DTO 불일치 버그 수정과 함께 진행
- 시드 러너를 외부 파일(`docs/guide/` 마크다운 또는 JSON) 읽기 방식으로 확장 → 스테이징 재현성 확보

**옵션 C. Google Drive 소스 동기화 구현 (장기)**
- `knowledge_sources.type='gdrive'` 실동기화: Google Docs API로 주기 폴링/버전 감지 → 파싱 → upsert.
  문서 개정 시 자동 반영. §12 충돌관리·검수 워크플로(초안→승인→활성)와 함께 설계해야 실효성 있음.

### 3.3 실행 순서 (권장 로드맵)
1. **[문서 오너]** §12 충돌·미확정 항목 확정, 탭4 운영 결정(Beautizen 준비중, B2B 미확정 등) 최종본 반영
2. **[사전 조치]** 스테이징/개발 DB FULLTEXT 인덱스 확인·적용, `docker/init-sql` 스키마 동기화
3. **[행동 규칙 이관]** §0·§10 → 테넌트 페르소나/응답 규칙 및 시나리오 버튼 구성에 반영 (KB 등록 제외)
4. **[1차 등록]** 옵션 A로 KR/EN 약 160건 등록(`active:0`) → 항목별 400자 스니펫 검수 → 활성화
5. **[검증]** 언어별 대표 질문 세트(배송비·반품조건·포인트·Beautizen 등)로 위젯 실질의 →
   검색 적중·응답 품질·모더레이션 통과·상담 이관 동작 확인
6. **[후속 개발]** 옵션 B(벌크 API+UI+시드 파일화), `language` 컬럼 추가, 검색 스코프의
   source status 반영, (중기) 실제 임베딩 도입 검토 — `AiAdapter`에 `embed()` 확장 필요

---

## 4. 리스크 요약

| 리스크 | 영향 | 완화 |
|---|---|---|
| 400자 스니펫 제한 | 긴 정책의 뒷부분이 AI에 전달 안 됨 | 기본 답변·수치를 content 앞부분 배치, 항목 세분화 |
| 등록 즉시 노출(`active:1` 강제) | 미검수 정책이 고객 응대에 사용 | 등록 직후 일괄 비활성 → 검수 후 활성 |
| 한국어 FULLTEXT 인덱스 누락 DB | KO 질의 검색 품질 저하 | 인덱스 사전 확인·적용 |
| §12 미확정 정책 등록 | 잘못된 정책 안내 + count 기반 confidence로 이관 억제 | 확정 전 등록 보류, §0.4 미확정 안내 원칙 |
| 시나리오 스크립트와 KB 이중 관리 | 버튼 응답(`scenario.service.ts`)과 KB 정책 간 불일치(드리프트) | 등록 시 시나리오 문구 대조·갱신, 장기적으로 단일 소스화 |

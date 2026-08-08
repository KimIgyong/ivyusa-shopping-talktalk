# RPT-260808-Widget-Greetings-EndChat-AnswerReuse

위젯 문구 설정화(A) · 상담종료(B) · 유사질문 답변 재사용(C) 구현 결과 보고서.

- 근거: REQ/PLN-260808-Widget-Greetings-EndChat-AnswerReuse (2026-08-08 승인:
  D-A1 저장안함 · D-A2 JSON 블롭 · D-A3 신규세션 1회 · D-B1 대화만 종료 ·
  D-C1 상담원+고신뢰AI · D-C2 무표기+trace · D-C3 관리UI+편집저장)
- 테스트: TCR-260808-Widget-Greetings-EndChat-AnswerReuse

## 1. 무엇이 바뀌었나

### A. 위젯 문구 설정화 — PR #174
- **현결함 수정**: 위젯 i18n에 하드코딩된 "IVY USA"가 모든 테넌트에 노출되던 문제 제거
  (기본문 {shop} 변수화 + 헤더 "알림 센터"→테넌트 표시명).
- `tenants.widget_copy` JSON (표시이름 + 언어별 첫방문/로그인 인사) — 향후 문구 추가는 무마이그레이션.
- `/tenants/widget-settings` GET/PATCH 확장(PATCH 시맨틱), `/session/ensure`가 widgetCopy 전달
  (displayName은 서버에서 tenant.name 폴백 해석).
- 위젯: 환영 버블 설정문구 사용({shop}/{name} 치환), **대화 중 로그인 시 1회 렌더 전용 인사 버블**(요구 4).
- 콘솔 /settings 위젯 카드: 표시이름 + EN/ES/KO 탭 문구 2종 편집, 저장 토스트.

### B. 상담종료 — PR #175
- `POST /chat/end`(@Public 세션토큰): open 대화 ENDED+배정 release(콘솔 종료와 동일 전이), 중복 클릭 no-op.
- `GET /chat/conversation`이 **latest** 대화를 읽어 종료 스레드가 status 'ended'로 보임
  (기존엔 'none'으로 붕괴 → 상담원 종료를 위젯이 인지 못 했음 — 부수 결함 수정).
- 위젯: 고지바에 "상담 종료" → 인라인 확인 → 종료 구분선 안내; 다음 메시지 = 새 상담(기존 시맨틱 재사용);
  상담원 종료도 폴링으로 동일 표시. 로그인/세션 유지(D-B1).

### C. 답변 재사용 — PR #176(백엔드) / #177(콘솔)
- `answer_reuse` 테이블 + Qdrant `reuse_questions` 컬렉션(질문 임베딩, point id=행 id, MySQL이 진실).
- **적재(D-C1)**: 상담원 답변(사람 검증) + AI 답변은 인용 있음∧confidence≥0.75∧주문맥락 아님일 때만;
  PII 스크럽본만 저장; 중복(≥0.95) 스킵; 테넌트 캡 2,000.
- **조회**: LLM 호출 직전 유사도 ≥0.92(env), 테넌트+언어 스코프; **재생도 모더레이션 게이트 통과(FR-069)** —
  BLOCKED 재생은 자동 비활성; trace `answeredFrom:'reuse'`(고객 무표기, D-C2); hit_count/last_hit_at.
- **fail-open**: stub 임베딩·Qdrant 다운·모든 오류 → 기존 RAG+LLM 경로(스텁 테넌트 동작 불변).
- TTL 30일 read-time 은퇴; **DSAR 삭제 시 파생 항목(행+벡터) 동반 삭제**.
- 콘솔 /ai-setting "답변 재사용" 섹션: 검색/활성필터/출처·히트 배지/ON-OFF/인라인 **답변 편집 저장**(편집=사람검증 승격)/삭제/전체 비활성화.
- env(선택): `ANSWER_REUSE_ENABLED`/`_THRESHOLD`/`_MIN_CONFIDENCE`/`_TTL_DAYS`.

## 2. 배포 상태

| 항목 | 상태 |
|---|---|
| PR | #174(A) #175(B) #176(C1) #177(C2) — 전부 CI pass 후 squash-merge, main `272de94` |
| 마이그레이션 | `sql/260808-tenant-widget-copy.sql`, `sql/260808-answer-reuse.sql` — **staging 선적용 후** 코드 배포 |
| staging 배포 | 2026-08-08 15:24 KST — 부트 정상, 스키마 에러 0, `reuse_questions` 컬렉션 자동 생성 확인 |
| 배포 검증 | ensure 응답 widgetCopy 확인(amoebaorder), /chat/end live, /admin/answer-reuse 401 |
| production | 미배포(호스트 미정) |

## 3. 남은 일
- 사용자 수동 스모크 E1~E7 (TCR §4) — 특히 E5(동일 질문 2회 → 재사용 히트)는 실 LLM 스테이징에서 확인.
- 운영 tip: 지식/정책 대량 갱신 후엔 콘솔 "전체 비활성화" 사용(재학습은 자동).

## 4. 예방 패턴
- **공용 서비스 생성자에 파라미터를 추가할 땐 말미에 + 옵셔널·가드** — 위치 기반 목이 있는 스펙(4곳)이 전부
  무수정 통과. 중간 삽입은 "session spec ordering" 유형의 조용한 슬롯 밀림을 만든다.
- **웹 Paginated는 apiGetList의 로컬 타입({items,total})** — 백엔드 pagination 메타 필드명을 넘겨짚지 말 것.
- 재사용 캐시류 기능은 반드시 ①모더레이션 게이트 앞 삽입 ②fail-open ③개인 맥락 제외 3원칙으로 — 이번 구현의 안전 뼈대.

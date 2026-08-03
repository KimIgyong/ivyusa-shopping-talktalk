# REQ — 데이터 인벤토리 + 보존/파기 매트릭스 (Doc-A)

| 항목 | 내용 |
|---|---|
| 문서 ID | REQ-Data-Inventory-20260731 |
| 작성일 | 2026-07-31 |
| 범위 | IVY USA Chat & Support Widget(ShopTalk) 전 저장소 — MySQL 전 테이블(`sql/01-schema.sql` + `apps/api/src/domain/**/entity/*.entity.ts`), Redis, RabbitMQ, 로그, 백업, 외부 전송(egress) |
| 기준 | `reference/amoeba_privacy_compliance_v2.md` (PRV-001~006 원칙, §4 PII 처리, §6 수탁자/국외이전) · REQ-Privacy-Control-Gap-20260731 #1(데이터 인벤토리) |
| 소유자 | 개인정보 보호책임자(TBD/지정 필요) · 기술 확인: 개발팀 |

> 본 문서의 모든 사실은 2026-07-31 기준 저장소 코드에서 직접 확인한 것이다.
> 코드로 확인 불가한 항목은 `TBD/확인 필요`로 표기했다(추정 기재 금지).

---

## 1. 조사 방법

- 엔티티 41개 파일(`apps/api/src/domain/**/entity/*.entity.ts`)과 부트스트랩 DDL(`sql/01-schema.sql`, 테이블 34개) 전수 대조.
- 암호화 여부: `apps/api/src/global/util/crypto.util.ts`(AES-256-GCM, `[12B IV][16B tag][ciphertext]`, 키 `CRED_ENC_KEY` 32바이트) 및 각 엔티티의 transformer 적용 여부로 판정.
- 보유기간: `apps/api/src/domain/privacy/retention.service.ts` 코드 기준 — 환경변수 `CONVERSATION_LOG_RETENTION_DAYS`(기본 **365일**) 경과분을 24시간 주기(부팅 5분 후 첫 실행, `RETENTION_PURGE_INTERVAL_HOURS`)로 삭제하며, 수동 트리거는 `POST /privacy/retention/purge`. **파기 대상은 messages → conversations → cjm_events → notifications → (대화 미참조) sessions 5종뿐**이다. 그 외 테이블은 자동 파기 대상이 아니다.
- 법적 근거 열은 컴플라이언스 기준(PRV-001)에 따른 **제안 판단**이며 최종 확정은 승인란 결재로 한다.

## 2. 표 1 — 테이블별 인벤토리 (MySQL)

### 2.1 개인정보 포함 테이블

| 테이블 | 개인정보 항목(컬럼) | 정보주체 | 수집 경로 | 처리 목적 | 법적 근거(제안) | 암호화 여부(코드 근거) | 보유기간(retention.service.ts 기준) |
|---|---|---|---|---|---|---|---|
| `customers` | `email`, `name`, `phone`(이상 varbinary 암호문), `email_hash`(블라인드 인덱스), `shopify_customer_id`, `tier` | 쇼핑몰 고객 | Shopify 고객 동기화·앱 프록시 인증, 게스트 주문조회(주문번호+이메일) | 고객 식별, 등급별 응대, 주문 상담 | 계약이행(구매·CS) | **AES-256-GCM 암호화** — `customer.entity.ts`의 `piiTransformer`(email/name/phone) + `email_hash` = HMAC-SHA256 블라인드 인덱스(`blindIndex`, PRV-M6) | **자동 파기 미포함** — DSAR 삭제(`privacy.service.deleteData`)·GDPR `customers/redact`·`shop/redact` 시 비식별화만. 보존기한 정책 미정(갭 G-1) |
| `sessions` | `session_token`, `customer_id`(연결), `language`, `consent_state/at/version`(동의 기록, 고지 버전 `2026-07`), `identity_level` | 위젯 방문자(비회원 포함) | 위젯 세션 개시(`session.service.ensure`) | 세션 유지, CCPA 동의 관리, 언어 결정 | 계약이행 + 동의(동의기록 자체는 법적 의무) | 평문 | **365일 파기 대상**(단, conversations가 참조 중인 세션은 잔존) |
| `conversations` | 세션 연결, 상담 상태, `agent_id` | 고객·상담원 | 채팅 개시 | 상담 스레드 관리 | 계약이행 | 평문 | **365일 파기 대상** |
| `messages` | `body`(**채팅 원문 — 자유 텍스트, 고객이 입력한 모든 PII 포함 가능**), `lang`, `retrieval_trace` | 고객·상담원·AI | 위젯 채팅(`chat.service.persist`) | 상담 수행, AI 응답, 상담 이력 | 계약이행(상담), AI 처리 부분은 동의(위젯 동의 배너 — declined 시 미저장·미처리, `chat.service` PRV-M4 분기) | 평문 | **365일 파기 대상** |
| `cjm_events` | `session_id`/`customer_id` 연결, `payload`(json) | 고객 | 이벤트 버스(`EVENTS.CJM`) | 고객 여정 분석 | 정당이익(서비스 개선) — opt-out 경로 확인 필요 | 평문 | **365일 파기 대상** |
| `notifications` | `customer_id`, `title`/`body`(**주문번호 등 포함** — retention.service.ts 주석 명시) | 고객 | 주문/재입고/리뷰 이벤트 | 알림 제공 | 계약이행 | 평문 | **365일 파기 대상** |
| `notification_prefs` | `customer_id`, 채널별 수신 동의 상태(CCPA opt-out 상태 겸용 — `privacy.service.setOptOut`) | 고객 | 위젯 설정, CCPA opt-out | 수신 동의 관리 | 동의(동의기록은 법적 의무) | 평문 | 자동 파기 미포함 — DSAR 삭제 시 delete |
| `orders_cache` | `shopify_order_id`, `order_number`, `customer_id`, 금액 | 고객 | Shopify Admin API 캐시 | 주문 상담 | 계약이행 | 평문 | **자동 파기 미포함**(갭 G-2). 원본은 Shopify(캐시임) |
| `order_items` | 주문 품목(제품·수량·가격) | 고객 | 〃 | 〃 | 계약이행 | 평문 | **자동 파기 미포함** |
| `fulfillments` | `tracking_number`, `carrier` | 고객 | Shopify 웹훅(`EVENTS.WEBHOOK_FULFILLMENT`) | 배송 안내 | 계약이행 | 평문 | **자동 파기 미포함** |
| `reviews` | `customer_id`, `body`(자유 텍스트) | 고객 | 위젯 리뷰 작성 | 리뷰 운영 | 동의 | 평문 | 자동 파기 미포함 — DSAR 시 body null 처리 |
| `inquiries` | `customer_id`/`order_id` 연결 | 고객 | 상담 중 생성 | 문의 추적 | 계약이행 | 평문 | 자동 파기 미포함 — DSAR 시 customer 연결 해제 |
| `restock_subscriptions` | `customer_id`, `product_id`, 채널 | 고객 | 재입고 알림 신청 | 재입고 알림 | 동의 | 평문 | 자동 파기 미포함 — DSAR 시 delete |
| `subscriptions` | `customer_id`, `shopify_subscription_id`, 플랜 | 고객 | Shopify 연동 | 구독 상담 | 계약이행 | 평문 | 자동 파기 미포함 — DSAR 시 delete |
| `affiliates` | `customer_id`, `link_code`, 수수료율 | 고객(제휴 신청자) | 제휴 신청 | 제휴 운영 | 계약이행 | 평문 | 자동 파기 미포함 — DSAR 시 delete |
| `users` | `email`, `name`(**평문**), `password_hash`(bcrypt), `rank`, `password_changed_at` | 테넌트 소속 직원 | 초대/가입 | 콘솔 인증·RBAC | 계약이행(고용/위탁) | 비밀번호만 bcrypt, email/name 평문 | **자동 파기 미포함** — 퇴직자 계정 처리 정책 미정(갭 G-3) |
| `admin_users` | `email`, `password_hash`(bcrypt) | 플랫폼 관리자 | 시드/생성 | 플랫폼 운영 | 계약이행 | 비밀번호만 bcrypt | 자동 파기 미포함 |
| `invitations` | `email`(**평문**), `token`, `temp_password_hash` | 초대 대상자 | 관리자 초대 | 계정 초대 | 계약이행(체결 준비) | temp_password bcrypt, email 평문 | 자동 파기 미포함 — `expires_at` 경과 후에도 행 잔존(갭 G-4) |
| `agents`(레거시) | `name`, `email`(**평문**) | 상담원 | 시드/레거시 | (users로 대체된 레거시 축) | 계약이행 | 평문 | 자동 파기 미포함 — 사용 여부 정리 필요 |
| `agent_profiles` | `user_id` 연결, `languages`, `skills` | 상담원 | 콘솔 설정 | 배정 라우팅 | 계약이행 | 평문 | 자동 파기 미포함 |
| `agent_alerts` | `preview`(**고객 메시지 원문 최대 300자** — `chat.service` `preview.slice(0,300)`) | 고객 | 에스컬레이션 이벤트 | 상담원 알림 | 계약이행 | 평문 | **자동 파기 미포함**(갭 G-5 — 채팅 원문 파생본이 365일 매트릭스 밖에 잔존) |
| `moderation_logs` | `excerpt`(**AI/상담원 발신문 512자** — `moderation.service` `truncate(input.text, 512)`), `author_id` | 고객(대화 상대)·상담원 | 모더레이션 게이트 | 모더레이션 감사 | 정당이익(안전·감사) | 평문 | **자동 파기 미포함**(갭 G-5와 동일 성격) |
| `audit_logs` | `actor_id`, `target`(이메일은 `maskPii` 마스킹 후 기록 — `privacy.service` 참조) | 직원·고객 | `AuditService.write` | 책임추적(PRV-040) | 법적 의무/정당이익 | 평문(마스킹 저장) | **자동 파기 미포함** — 감사로그 보존연한 정책 필요(갭 G-6) |

### 2.2 개인정보 비포함(또는 자격증명) 테이블

| 테이블 | 성격 | 비고 |
|---|---|---|
| `integration_credentials` | 테넌트 연동 비밀키 | `secret_enc` **AES-256-GCM 암호화**(POL-018, `crypto.util.encryptSecret`) |
| `ai_engines` | AI 공급자 라우팅 | `api_key_encrypted` **AES-256-GCM 암호화** |
| `tenants`, `tenant_ai_config`, `tenant_ai_settings` | 테넌트 설정 | 개인정보 없음(상호·도메인은 사업자 정보) |
| `kb_documents`, `kb_board_posts`, `kb_files`, `knowledge_sources` | 지식베이스 | 원칙상 개인정보 없음. 단, **정책 문서/게시글에 담당자명·연락처가 포함될 수 있어 등록 시 검수 필요**(운영 규칙) |
| `content_filter_rules`, `roles_permissions`, `job_labels`, `user_job_labels`, `integration_status`, `campaigns`, `agent_daily_stats` | 설정·통계 | `campaigns.segment_ref`는 세그먼트 참조 문자열(개인 식별 없음), `agent_daily_stats`는 상담원별 성과 통계(직원 개인정보의 일종 — 인사평가 활용 시 고지 필요) |

## 3. 표 2 — 저장소·비정형 채널

| 저장소 | 포함 데이터(코드 근거) | 보존/휘발 | 비고·갭 |
|---|---|---|---|
| MySQL(도커 볼륨 — dev `:3316`, 스테이징 `ivy_mysql_staging_data`, 호스트 루프백 `127.0.0.1:3317` 바인딩) | 표 1 전체 | 볼륨 영속 | 스테이징 DB는 SSH 터널로만 접근(compose 주석, SEC/INF-2) |
| Redis(스테이징 `ivy_redis_staging_data` 볼륨) | ① `sess:tok:{token}` — **세션 객체 전체(customer_id·동의상태 포함) 30초 TTL** (`session.service` `SESSION_CACHE_TTL_SEC=30`) ② `modrules:{tenantId}` — 모더레이션 규칙 60초 TTL | TTL 만료 자동 소멸 | 스테이징 Redis에 데이터 볼륨이 마운트되어 있어 스냅샷(RDB) 파일에 세션 토큰이 일시 잔존 가능 — 영향도 낮으나 백업 정책 수립 시 함께 다룰 것 |
| RabbitMQ(`ivy.events` topic exchange, persistent 발행) | 이벤트별 페이로드(`event-bus.service` + 발행처 코드 확인): · `cjm.event` — id들만(PII 없음) · `conversation.log` — id들만 · `notification.event` — `title`/`body`에 **주문번호 포함**(`order.service` "Your order {orderNumber}…") · `escalation.requested` — `preview`에 **고객 메시지 원문 최대 300자**(`chat.service.EscalationEvent`) · `webhook.fulfillment` — 송장번호 · `campaign.dispatch` — id들만 | 브로커 소비 시 소멸(미소비 큐 잔존 가능) | 에스컬레이션·알림 이벤트에 PII가 실림 — 브로커 접근통제(계정·네트워크)가 통제선. 스테이징은 compose 내부 네트워크만 노출 |
| 애플리케이션 로그(docker logs) | `audit` 외 일반 로그. 이메일은 `maskPii` 마스킹 원칙. `notification.service`가 `mock-deliver {channel} -> customer {id}: {title}` 을 debug 로그로 남김(주문번호 포함 가능). **4xx는 기본 미기록**(CLAUDE.md §2) | 컨테이너 로테이션 정책 미정 | 로그 보존기간·로테이션 기준 미정(갭 G-7) |
| Qdrant(`ivy_qdrant_staging_data`) | KB 벡터 + payload(`tenant_id`/`category`/`source`/`active`만 — `qdrant.service.KbVectorPayload`). **문서 본문·개인정보 미저장**, MySQL에서 재빌드 가능 | 볼륨 영속 | 개인정보 위험 낮음 |
| **백업** | — | **절차 없음(확인된 현황)** — 저장소에 백업 스크립트/크론/문서 부재 | **갭 G-8**: 백업 부재는 가용성 리스크인 동시에, 백업 도입 시 "백업본 내 파기 대상 데이터 처리(PRV §4 Backup)" 정책을 반드시 함께 수립해야 함 |

## 4. 표 3 — 외부 전송(egress)

| 전송처 | 전송 데이터(코드 근거) | 목적 | 처리 국가 | 근거/상태 |
|---|---|---|---|---|
| Shopify Admin API (GraphQL, `shopify-admin.client.ts` — `https://{shop}/admin/api/{ver}/graphql.json`) | 주문 조회 질의(주문번호·고객 식별자); 응답으로 고객 `email`/`firstName`/`lastName`/주문 정보 **수신**(Protected Customer Data) | 주문 상담 | 미국(Shopify 인프라 — 리전 `TBD/확인 필요`) | 계약이행. GDPR 웹훅 3종(`customers/data_request`/`customers/redact`/`shop/redact`) 구현 완료(`privacy.service`). PCD 등급 승인 절차 진행 필요 |
| Anthropic Messages API (`anthropic.adapter.ts` — `api.anthropic.com`, 기본 모델 `claude-opus-4-8`) | **채팅 원문 전체**: 사용자 메시지 + RAG 컨텍스트(KB 스니펫) + 페르소나 프롬프트. 의도분류·모더레이션 분류·rephrase에도 대화 텍스트 송신 | RAG 답변·의도분류·모더레이션 | 미국 | ~~갭 G-9: 송신 전 PII 마스킹/필터 없음~~ **(2026-08-02 갱신)** PR #42로 chat egress에 `pii-scrub.util.ts` 마스킹(email/phone/card/order/address) 적용됨. 패턴 커버리지 한계 존재, DPA/ZDR(Zero Data Retention) 계약 상태는 여전히 `TBD/확인 필요` |
| Voyage AI (`voyage.adapter.ts` — `api.voyageai.com`, `voyage-4`) | ① KB 문서 텍스트(reindex 배치) ② **사용자 질의 원문**(라이브 채팅의 벡터 검색 leg — `rag.service.retrieveVector`가 `ai.embed([query])` 호출) | 임베딩 생성 | 미국 | 갭 G-9와 동일 — **(2026-08-02 갱신)** 질의 임베딩 leg에도 스크럽 적용. DPA 상태 `TBD/확인 필요` |
| SMTP 메일 / Slack Incoming Webhook (`agent-alert.service.ts`, `SMTP_*`/`SLACK_WEBHOOK_URL` 미설정 시 비활성) | 에스컬레이션 알림: 대화번호 + **고객 메시지 preview(최대 300자)** | 상담원 호출 | 설정된 제공자에 따름(`TBD/확인 필요`) | 운영 설정 시 수탁자 대장(Doc-B) 등록 필수 |
| 고객 대상 이메일/SMS/웹푸시 | **현재 미전송(mock)** — `notification.service`가 채널별 행 기록 + debug 로그만 남김 | (향후) 고객 알림 | — | 실제 제공자 선정 시 Doc-B 절차 선행 |
| Google GA4 (위젯 전환/UTM 추적) | 본 브랜치 코드에서 **GA4 래퍼 미확인**(`apps/widget/src/lib/analytics/` 부재). 별도 브랜치/PR(#20)에 consent-gated 래퍼가 있다는 기록 있음 | 전환 분석 | 미국(Google) | `TBD/확인 필요` — 병합 여부·Consent Mode v2 게이팅을 배포 브랜치에서 재검증할 것 |

## 5. 보존/파기 매트릭스 요약

| 구분 | 대상 | 주기/방식 |
|---|---|---|
| 자동 파기(365일, 조정 가능) | messages, conversations, cjm_events, notifications, (대화 미참조) sessions | 24h 스케줄러 + 수동 `POST /privacy/retention/purge`, 실행 시 audit `retention.purge` 기록 |
| 요청 기반 파기 | customers(비식별화), messages(redact), reviews.body, prefs/subscriptions/restock/affiliates(delete), inquiries/cjm/orders(연결 해제) | DSAR 삭제(`identity_level=VERIFIED` 필수) · Shopify GDPR 웹훅 |
| 테넌트 전체 파기 | 테넌트 스코프 전 테이블 | `shop/redact` → `purgeTenant`(트랜잭션) |
| **파기 정책 부재** | customers, orders_cache/items/fulfillments, reviews, users(퇴직자), invitations(만료분), agent_alerts, moderation_logs, audit_logs, 로그/백업 | **본 문서 승인으로 보존연한 확정 필요** |

### 승인란

| 역할 | 성명 | 승인일 | 서명 |
|---|---|---|---|
| 개인정보 보호책임자 | TBD | | |
| 서비스 소유자(IVY USA) | TBD | | |
| 개발 책임 | TBD | | |

### 미결(갭) 목록

| ID | 갭 | 조치 제안 |
|---|---|---|
| G-1 | `customers` 보존기한 없음(탈퇴/휴면 기준 부재) | 보존연한 확정 후 retention 파이프라인 확장 |
| G-2 | 주문 캐시(orders_cache/order_items/fulfillments) 무기한 보존 | 캐시 성격에 맞는 단기 보존(예: 최근 N일) 검토 |
| G-3 | 퇴직/비활성 직원 계정(users) 처리 절차 없음 | 오프보딩 체크리스트에 계정 비활성·개인정보 정리 포함 |
| G-4 | 만료된 invitations 행 잔존(email 평문) | 만료분 정리 배치 추가 |
| G-5 | agent_alerts.preview / moderation_logs.excerpt — 채팅 원문 파생본이 365일 파기 대상 밖 | retention 대상에 추가 |
| G-6 | audit_logs 보존연한 미정 | 법정 요건 검토 후 확정(삭제가 아닌 장기보존 결정도 가능하나 명문화 필요) |
| G-7 | 앱 로그 로테이션/보존 기준 없음 | docker 로그 드라이버 옵션 + 보존기간 명문화 |
| G-8 | 백업 절차 부재(+도입 시 백업 내 파기 반영 정책 필요) | 백업 설계 시 암호화·보존기간·DSAR 반영 방식 포함 |
| G-9 | ~~Anthropic/Voyage 송신 전 PII 마스킹 없음~~ **(2026-08-02 갱신: PR #42로 마스킹 적용됨 — 패턴 범위·DPA/ZDR은 미확인 잔존)** | 잔여: 마스킹 패턴 커버리지 정기 점검 + Doc-B 대장에서 계약 상태 확정 |
| G-10 | GA4 래퍼가 본 브랜치에 없음 — 배포 브랜치 기준 동의 게이팅 재확인 필요 | 병합 상태 확인 후 본 인벤토리 갱신 |

# Gorgias 커넥터 설정 가이드 (bridge 모드)

ShopTalk 에스컬레이션을 Gorgias 티켓으로 전달(L1)하고, 티켓 상태를 위젯 알림으로 회신(L2)하는 설정.
관련: PLN-260808-Issue-Workflow-P2 §S4, PLN-260809-Issue-Workflow-P3 §S3.

## 1. 자격증명 (콘솔)
`/settings → 헬프데스크 연동 → Gorgias`:
| 필드 | 값 |
|---|---|
| Account subdomain | `your-company` (your-company.gorgias.com의 앞부분) |
| Account email | REST API 키를 발급한 계정 이메일 |
| API key | Gorgias Settings → REST API의 키 |
| Webhook secret (L2) | 임의의 긴 랜덤 문자열 — 아래 3단계에서 동일 값 사용 |

저장 후 **연결 테스트** → Connected 확인.

## 2. 테넌트 bridge 전환 (플랫폼 운영자)
```sql
UPDATE tenants SET workflow_mode='bridge' WHERE id={tenantId};
```
> bridge 모드에서는 네이티브 이슈(칸반)가 생성되지 않고, 에스컬레이션이 Gorgias 티켓으로 전달됩니다(모드 배타성).

## 3. L2 상태 회신 — Gorgias HTTP Integration (선택)
Gorgias Settings → Integrations → **HTTP Integration** 생성:
- **Trigger**: Ticket updated
- **Method/URL**: `POST https://shoptalk.amoeba.site/api/v1/webhooks/gorgias`
- **Headers**: `x-shoptalk-token: {1단계의 Webhook secret}` · `Content-Type: application/json`
- **Body(JSON)**:
```json
{ "ticket": { "id": {{ticket.id}}, "status": "{{ticket.status}}" } }
```
동작: 티켓이 **closed** 되면 고객 위젯에 "문의 처리가 완료되었습니다" 알림이 가고,
그 뒤 같은 대화가 재에스컬레이션되면 기존 티켓 append 대신 **새 티켓**이 생성됩니다(결정 12).

## 4. 동작 요약
| 이벤트 | 결과 |
|---|---|
| 에스컬레이션(최초) | Gorgias 티켓 생성 — 전체 대화록(방향·시각 보존) + 최근 주문 노트 + 태그(shoptalk, 사유) |
| 재에스컬레이션(티켓 open) | 신규 고객 메시지를 기존 티켓에 append |
| 재에스컬레이션(티켓 closed, L2) | 새 티켓 생성 |
| 티켓 closed (L2) | 고객 위젯 인앱+푸시 알림 |
| 고객 이메일 없음 | 전달 스킵(서버 warn) — Gorgias 고객 매칭 축이 이메일 |

## 5. 유의
- 상담원 답변은 Gorgias의 이메일 채널로 고객에게 전달됩니다(위젯 채팅 릴레이는 L3, 미구현).
- Webhook secret 미설정 시 L2는 동작하지 않으며 L1(생성/append)만 동작합니다.

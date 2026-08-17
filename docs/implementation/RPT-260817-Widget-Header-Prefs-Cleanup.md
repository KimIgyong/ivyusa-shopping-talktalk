# RPT-260817-Widget-Header-Prefs-Cleanup

헤더 사용자명 · 탭 노출 설정 확인 · 알림채널 콘솔 이관 구현 보고.

- 작성일: 2026-08-17
- 문서 체인: `REQ-260817-Widget-Header-Prefs-Cleanup` → `PLN-…` → 구현 → `TCR-…` → 본 문서
- PR: **#306** (squash) · main 커밋 **`d7334f3`**
- 배포: **스테이징 LIVE 2026-08-17 15:45 UTC** · 프로덕션 미배포

## 1. 요구별 결과

| 요구 | 결과 |
|---|---|
| 1. 헤더에 로그인 사용자명 | ✅ `{이름}님` / `Hi, {name}`. 미로그인은 테넌트명 유지 |
| 2. 탭 노출 설정 메뉴 확인 | ✅ **조치 없음** — 이미 존재·배포됨(§2) |
| 3. 이메일/SMS/앱푸시 설정 위치 | ✅ 콘솔로 이관 + 위젯엔 마케팅 옵트아웃 1개만 잔류 |

## 2. 요구 2 — 확인 결과

| 축 | 결과 |
|---|---|
| 위치 | 콘솔 `/settings` → **위젯 동작** 카드, `타임존`과 `위젯 문구` 사이 |
| 노출 조건 | 없음(`SettingsPage.tsx`에서 무조건 렌더) |
| 배포 확인 | 스테이징 번들 `SettingsPage-CIxiVrbA.js`에 `노출할 탭`·`탭 위치` 존재 |

## 3. 설계에서 중요한 판단

### 3.1 헤더 두 프레임은 모순이 아니었다
Master Shots는 헤더를 `Hi, Lisa`(34·40–45)와 `알림센터`(48·49·53–69)로 그린다.
첫 REQ에서 "엇갈린다"고만 적었던 지점인데, **로그인 상태로 갈린다고 보면 둘 다 설명된다.**
요구 1이 그 해석과 같아서, 디자인을 바꾸지 않고 분기만 넣었다.

### 3.2 "마케팅"을 목록으로 쓰지 않고 파생시켰다
위젯 토글이 덮는 범위와 서버의 default-deny 범위는 **정확히 같아야 한다.** 목록을 두 벌
쓰면 카테고리가 추가되는 순간 갈라지고, 그 실패 모드는 **옵트아웃한 고객에게 조용히
마케팅이 나가는 것**이다. 그래서 `isMarketingCategory = !거래성`으로 파생시켰다.

### 3.3 상한(테넌트)과 선택(고객)을 분리했다
`발송 = 상점이 허용 AND 고객이 끄지 않음`. 이 순서 덕분에 상점이 SMS를 끄면 무조건 안 나가고,
허용 범위 안에서는 **모바일/PWA의 푸시 토글이 그대로 산다**. 판정은 `isSuppressed()` 한 곳.

### 3.4 옵트아웃을 8번의 쓰기가 아니라 1번의 호출로
위젯이 pref 8건(2 카테고리 × 4 채널)을 개별로 쓰면 부분 실패 시 고객이 "반쯤 옵트아웃"된
상태가 되고 본인은 알 길이 없다. `PATCH /notifications/marketing-opt-out` 하나로 서버가 처리한다.

## 4. 변경 파일

### 신규
`sql/migration_notification_channels.sql` · 콘솔 `NotificationChannelsCard`(SettingsPage 내) ·
위젯 `useMarketingOptOut`/`useSetMarketingOptOut` · API `GET|PUT /notifications/marketing-opt-out` ·
API `GET|PATCH /tenants/notification-channels`

### 수정
`packages/types/common/enum.types.ts`(거래성·외부채널·`isMarketingCategory`·`channelAllowedByTenant`) ·
`tenant.entity`/`tenant.request`/`tenant.response`/`tenant.service`/`tenant.mapper`/`tenant.controller` ·
`notification.service`(상한 판정·옵트아웃)/`notification.controller`/`notification.module`/DTO ·
위젯 `WidgetPanel`(헤더)/`PreferencesPanel`(매트릭스 제거)/`notificationService`/`useNotifications`/로케일 6종 ·
콘솔 `settings.service`/`settings.hooks`/`SettingsPage`/로케일 6종

## 5. 마이그레이션

```sql
ALTER TABLE `tenants` ADD COLUMN `notification_channels` json NULL AFTER `widget_tab_position`;
```
- **백필 없음** — NULL = 상한 없음 = 현행 발송 동작 그대로.
- 롤백: 컬럼 DROP. 순서: 대상 DB 선적용 → 코드 배포.
- 멱등 실측: 재실행 `exit=0`.
- 적용: local ✅ · **staging ✅ (2026-08-17, 코드 배포 전 선적용)** · production ⬜

## 6. 테스트 결과

| 항목 | 결과 |
|---|---|
| 신규 단위 테스트 | **14건** (U-1~U-14) |
| 전체 스위트 | **1,301 + 108 통과 / 실패 0** |
| typecheck / build | ✅ 13/13 |
| `npm run i18n:check` | ✅ |
| API 실부팅 | ✅ |
| 로컬 통합 | S-1~S-9 통과 (TCR §3) |

## 7. 구현 중 드러난 것

**`@SessionToken()`은 본문을 읽지 않는다.** 헤더·쿼리·경로만 본다. 새 `PUT`을 그 데코레이터로
만들었더니 401이 났고, 형제 엔드포인트 `PUT /prefs`가 왜 토큰을 본문 DTO로 받는지가 그제서야
설명됐다. 같은 방식으로 맞췄다(TCR E-4).

## 8. 잔여 / 후속

| # | 항목 | 비고 |
|---|---|---|
| N-1 | **콘솔 알림채널 카드 육안 미확인** | 로그인 비밀번호 입력이 필요해 미수행 |
| N-2 | 테넌트 상한의 엔드투엔드 발송 검증 | 알림을 HTTP로 발행하는 경로가 없어 단위 수준까지 |
| N-3 | 모바일/PWA 푸시 토글 실동작 | 실기기 필요 |
| N-4 | 6개 언어 육안 렌더 | ko만 확인 |
| N-5 | 스테이징 배포 + 회귀 | 마이그레이션 선적용 필수 |
| N-6 | ⚠️ 거래성 이메일/SMS의 고객 개별 해제 수단 없음 | 승인된 방향(테넌트가 결정). 문의 발생 시 재검토 지점 |
| N-7 | **자동 코드리뷰 미실행** | GitHub 장애로 CodeRabbit이 2회 모두 실패(§9.2). 장애 복구 후 사후 리뷰 권장 |

## 9. 스테이징 배포 기록 (2026-08-17)

| 단계 | 내용 | 결과 |
|---|---|---|
| 1 | `tenants` 스키마 스냅샷 | ✅ `backup-pre-notifchannels-20260818-002713.sql` |
| 2 | 마이그레이션 선적용 (`docker cp` + 파일 실행) | ✅ exit 0 |
| 3 | 적용 검증 | ✅ 컬럼 생성, **테넌트 4곳 전부 NULL**, 기존 `notification_prefs` 20건 보존 |
| 4 | `deploy-staging.sh` (#306, `d7334f3`) | ✅ |
| 5 | 부팅 / 컨테이너 나이 / 스키마 에러 / health | ✅ `successfully started`, 30초, 0건, ok |
| 6 | 위젯 자산 교체 | ✅ `index-Dm3SoG4W.js` → `index-BbjoHNFO.js` (CSS도 교체) |
| 7 | 위젯 번들 문구 | ✅ `마케팅 메시지 수신 거부` · `marketing-opt-out` 포함 |
| 8 | 콘솔 자산 | ✅ `index-BtDwU-Vd.js`에 `알림 채널` · `notifChannels`(6회) |
| 9 | 신규 API | ✅ `GET /tenants/notification-channels` → 401(배포됨) |
| 10 | 라이브 스모크 | ✅ 미로그인 헤더 = 테넌트명, 설정 패널에 **매트릭스 없음**, 콘솔 에러 0 |

### 9.1 판독 주의 2건 (검증 과정에서 정정)
- `GET /notifications/marketing-opt-out` → **404**. 런북상 "미배포" 신호지만, 본문이
  `E3001 Session not found`였고 **존재하지 않는 경로는 `E5002 Cannot GET`** 을 반환한다.
  기존 `unread-count`도 같은 조건에서 동일한 404/E3001 → **배포 정상.**
  상태 코드만 보고 판단했으면 오진했을 지점이다.
- 콘솔 청크에서 신규 문구가 0건으로 나왔으나, 이는 **구버전 청크 이름**을 조회한 탓이었다.
  현행 `index-BtDwU-Vd.js`에서 정상 확인.

### 9.2 리뷰가 실행되지 못한 채 머지됨 — 기록
CodeRabbit이 이 PR을 **두 번 다 리뷰하지 못했다**(“couldn't post its review summary /
couldn't update its existing comment” — GitHub GraphQL 503). 재요청(`@coderabbitai review`)도
같은 장애로 실패했다. REST·git은 정상이었고 CI(`typecheck·test·build`)는 success,
`mergeable_state=clean`이었으므로 진행했다.

이는 PR #303 때와 성격이 다르다 — 그때는 **리뷰가 진행 중인데 기다리지 않아서** 회귀를
내보냈고, 이번엔 **장애로 리뷰 자체가 불가능한 상태**였다. 다만 결과적으로 이 변경은
자동 리뷰를 거치지 않았으므로, 후속 리뷰 대상으로 남겨둔다(N-7).

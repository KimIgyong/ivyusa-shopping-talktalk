# REQ-260826-Go2Joy-Kotlin-Mobile-SDK

go2joy Kotlin 기반 모바일 앱에 ShopTalk 상담을 SDK 형태로 제공하기 위한 요구사항 분석

- 작성일: 2026-08-26
- 요청 요지: 기존 go2joy 모바일 앱이 ShopTalk을 자체 WebView 구현이 아닌 Kotlin SDK 의존성으로 연동할 수 있게 한다.
- 선행 산출물: `PLN-260820-Mobile-SDK`, `RPT-260820-Mobile-SDK`, `docs/guide/모바일SDK연동가이드_Mobile-SDK.ko.md`
- 관련 기능: `FR-S6` (모바일 앱 임베드), 임베드 SDK S1~S3

## 1. 결론

현재 ShopTalk은 Android WebView에서 필요한 **위젯 측 계약**을 이미 제공한다. 즉,
`?mode=app`, `window.__shoptalkHost(...)`, `window.ShopTalkAndroid.postMessage(...)`,
서명 기반 사용자 식별, 앱 닫기 요청은 구현·검증되어 있다.

그러나 go2joy 앱이 가져다 쓸 수 있는 Kotlin 라이브러리(AAR), 안정된 공개 API, 버전·배포 체계,
실기기 품질 보장은 없다. 따라서 이번 요구의 본체는 채팅 UI를 네이티브로 다시 만드는 일이 아니라,
기존 계약을 감싸는 **Android/Kotlin WebView 호스트 SDK**를 제공하는 일이다.

## 2. AS-IS

### 2.1 이미 재사용할 수 있는 ShopTalk 기능

| 영역 | 현황 | 근거 |
|---|---|---|
| 앱 화면 모드 | `?embed=1&mode=app`에서 데모 스토어·런처를 숨기고 채팅을 열린 상태로 표시 | `apps/widget/src/lib/host-bridge.ts` |
| 앱 → 위젯 명령 | `window.__shoptalkHost(JSON)`로 `identify`, `open`, `locale`, `logout` 수신 | 모바일 SDK 연동 가이드 §2 |
| 위젯 → 앱 이벤트 | Android 인터페이스 `ShopTalkAndroid.postMessage(JSON)`로 `ready`, `close-request`, `identified` 전달 | `host-bridge.ts` |
| 사용자 식별 | 고객사 서버가 `HMAC_SHA256(embed_secret, userId)`를 만들고 위젯 API가 검증 | 모바일 SDK 연동 가이드 §3 |
| WebView 사전 수신 | 위젯 마운트 전 메시지는 최대 20건 큐잉 | `host-bridge.ts` |
| 참조 구현 | React Native WebView 컴포넌트 존재. Android 네이티브는 문서 스니펫만 제공 | `packages/shoptalk-rn`, 모바일 SDK 연동 가이드 §6 |
| 계약 검증 | 프레임/RN/iOS/Android 브리지와 앱 모드 자동 테스트, 브라우저 시뮬레이터 검증 완료 | `RPT-260820-Mobile-SDK` §5 |

### 2.2 go2joy가 지금 직접 구현해야 하는 것

가이드의 Kotlin 예시는 최소 브리지뿐이다. go2joy가 직접 구현하면 각 앱 화면에서 다음을
반복 구현·검증해야 한다.

1. `WebView` 생성, JavaScript/DOM storage 설정 및 앱 모드 URL 조립
2. `@JavascriptInterface` 브리지 등록과 JSON 이벤트 파싱
3. 로그인·로그아웃 시점의 `identify`/`logout` 주입
4. `ivy:close-request` 수신 후 Activity/Fragment/NavController 닫기
5. 파일 첨부를 위한 `WebChromeClient.onShowFileChooser`
6. 외부 링크의 시스템 브라우저 전환, 키보드/화면 복귀, 로딩·오류 표시
7. SDK·위젯 버전 호환성, 개인정보 로그 마스킹, 실기기 회귀 테스트

이는 기능 중복과 계약 드리프트를 만든다. 특히 Android 파일 선택기를 누락하면 사진 첨부가
아무 반응 없이 실패하고, embed secret을 앱에 넣으면 APK에서 추출될 수 있다.

### 2.3 범위 경계

기존 `apps/mobile` 및 `packages/shoptalk-rn`은 React Native 참조 구현이다. go2joy는 Kotlin
기반이므로 이를 런타임 의존성으로 사용하지 않는다. 반대로 현재 위젯의 웹 채팅 UI와 API는
그대로 재사용한다. 별도 Kotlin 채팅 UI, 대화 API 재구현, 푸시 발송 인프라는 이번 요청의
대상이 아니다.

## 3. TO-BE

### 3.1 제공물

go2joy가 Gradle 의존성으로 추가할 수 있는 Android 라이브러리(가칭
`com.amoeba.shoptalk:shoptalk-android`)를 제공한다. 라이브러리는 공개 View/Fragment API와
설정 모델을 제공하고, 내부에서 ShopTalk WebView·브리지·플랫폼 처리를 소유한다.

```kotlin
val config = ShopTalkConfig(
    widgetUrl = "https://talk.example.com/widget/",
    shop = "go2joy.example",
    locale = "vi",
)

ShopTalkFragment.newInstance(config).also { fragment ->
    fragment.setListener(object : ShopTalkListener {
        override fun onReady() = fragment.identify(signedUser)
        override fun onCloseRequested() = findNavController().navigateUp()
        override fun onIdentified(result: IdentifyResult) = Unit
    })
}
```

위 코드는 목표 API의 형태를 설명하기 위한 예시다. 최종 패키지명, 네비게이션 방식, 최소 Android
버전은 계획 단계에서 확정한다.

### 3.2 SDK 기능 요구사항

| ID | 요구사항 |
|---|---|
| FR-K1 | Gradle로 추가 가능한 버전 고정 Android/Kotlin 라이브러리(AAR)를 제공한다. |
| FR-K2 | SDK는 `widgetUrl`, `shop`, `locale`을 검증해 `embed=1&mode=app` URL을 생성한다. 호출자가 `mode`를 임의로 바꿔 빈 화면/런처가 보이는 상태가 되지 않게 한다. |
| FR-K3 | SDK는 `identify(userId, hash, name?, email?, phone?)`, `open(tab)`, `setLocale(locale)`, `logout()`의 타입 안전 API를 제공하고 기존 메시지 형식을 그대로 전송한다. |
| FR-K4 | SDK는 `ready`, `close-request`, `identified(ok)`을 Kotlin listener/Flow 중 확정된 하나의 공개 이벤트 계약으로 노출한다. |
| FR-K5 | WebView 로드 전 호출한 명령도 유실하지 않고, 위젯의 사전 수신 큐와 중복돼도 안전하게 한 번의 의미로 처리한다. |
| FR-K6 | Android `ShopTalkAndroid` 브리지는 SDK 내부에만 두며, 외부 페이지/허용되지 않은 URL에서는 노출하지 않는다. |
| FR-K7 | 이미지·파일 첨부를 지원한다. `onShowFileChooser`, 런타임 권한, 취소·Activity 재생성 후 callback 정리를 포함한다. |
| FR-K8 | 대화 중 외부 링크는 시스템 브라우저 또는 go2joy가 제공한 링크 처리기로 전달한다. 위젯 도메인·허용된 앱 내부 URL만 WebView에 남긴다. |
| FR-K9 | 키보드·화면 회전·백그라운드 복귀 시 입력창/세션이 깨지지 않게 한다. 앱의 뒤로 가기와 위젯 X는 모두 호스트 화면 닫기 정책을 따른다. |
| FR-K10 | WebView 오류, 위젯 로드 실패, 브리지 JSON 오류는 앱이 식별 가능한 오류 이벤트로 받는다. 사용자 식별값·HMAC·메시지 본문은 로그에 기록하지 않는다. |
| FR-K11 | SDK 공개 API와 위젯 브리지 프로토콜의 호환 버전을 명시하고, 호환되지 않는 조합은 빌드/런타임에서 명확히 진단한다. |
| FR-K12 | go2joy 통합 샘플 앱, 설치 안내, 릴리스 노트, 실기기 검증 체크리스트를 함께 제공한다. |

### 3.3 보안·개인정보 요구사항

1. **embed secret은 SDK·APK·앱 저장소에 절대 포함하지 않는다.** go2joy 서버가 로그인한
   사용자 ID로 HMAC을 만들고, 앱은 결과 hash만 SDK에 전달한다.
2. SDK는 HTTPS 위젯 URL만 기본 허용한다. 개발용 localhost 예외는 디버그 빌드의 명시 설정으로
   한정한다.
3. JavaScript interface는 ShopTalk 위젯의 허용 URL을 로드할 때만 사용하고, 임의 리다이렉트
   페이지에서 호출 가능한 상태로 남기지 않는다.
4. SDK 텔레메트리/오류 로그에는 사용자 ID, 이메일, 전화번호, HMAC, 대화 본문, 첨부 파일 URI를
   넣지 않는다.
5. WebView 저장소를 삭제하거나 SDK를 로그아웃할 때의 세션/쿠키 처리 정책을 go2joy 개인정보
   삭제 흐름과 함께 명시한다.

## 4. 갭 분석

| # | AS-IS | 필요한 작업 | 영향 |
|---|---|---|---|
| G1 | Android Kotlin은 문서 스니펫만 존재 | 라이브러리 모듈, 공개 API, AAR 빌드·배포 | 신규 패키지/CI |
| G2 | 브리지 메시지는 JSON 자유형 | Kotlin request/event 모델과 입력 검증 | SDK 소비 안정성 |
| G3 | 파일 선택은 호스트 구현 책임 | Activity Result API, 권한·취소·구성 변경 처리 | 사진 첨부 신뢰성 |
| G4 | 외부 링크·키보드는 RN 참조만 구현 | Android 링크 처리와 WindowInsets/백 스택 정책 | 앱 UX |
| G5 | 자동 테스트는 브라우저 계약 중심 | Android 단위·Robolectric 및 go2joy 실기기 검증 | 플랫폼 회귀 방지 |
| G6 | 배포 패키지/레지스트리 없음 | Maven 저장소, SemVer, changelog, 소비 예제 | 릴리스 운영 |
| G7 | 위젯-호스트 프로토콜 버전 필드 없음 | 호환성 정책·최소 지원 위젯 버전 정의 | 무중단 업그레이드 |
| G8 | 실앱 검증 미완료 | go2joy 인증·네비게이션·파일·링크 실기기 UAT | 출시 차단 위험 |
| G9 | 개인정보 삭제와 WebView 저장소 연계 미정 | go2joy 탈퇴/로그아웃 시 SDK 정리 API와 운영 절차 | 개인정보 준수 |

스키마 변경은 예상하지 않는다. 위젯 서버 API와 메시지 계약을 유지하므로 API 데이터 모델 변경도
기본 범위에는 없다. 단, G7의 호환성 정보를 서버가 강제할 필요가 있다고 결정되면 별도 API/배포
영향을 재평가한다.

## 5. 사용자 흐름

```text
go2joy 로그인
  → go2joy 서버가 userId HMAC 서명
  → 앱이 ShopTalkFragment를 열고 signed user를 SDK에 전달
  → SDK가 mode=app WebView 로드
  → 위젯 ivy:ready
  → SDK identify 전송
  → 위젯이 /public/embed/identify 검증
  → SDK가 identified 성공/실패 이벤트 전달
  → 고객 상담
       ├─ 사진 첨부: Android chooser → 파일 URI 권한 → 위젯 업로드
       ├─ 외부 링크: 시스템 브라우저/앱 링크 처리기
       └─ X 또는 뒤로 가기: close-request → go2joy 이전 화면 복귀
go2joy 로그아웃/탈퇴
  → SDK logout + WebView 세션 정리(정책 확정 필요)
```

## 6. 제약과 리스크

| ID | 리스크/제약 | 대응 방향 |
|---|---|---|
| R1 | WebView/Android System WebView 버전에 따라 파일·쿠키·키보드 동작이 다름 | go2joy 지원 OS/기기 매트릭스를 먼저 확정하고 실기기 UAT를 출시 기준으로 둔다. |
| R2 | 기존 브리지 이름 `ShopTalkAndroid`를 바꾸면 배포된 위젯과 호환이 깨짐 | 이름과 메시지 형식은 유지하고 Kotlin API만 그 위를 감싼다. |
| R3 | `addJavascriptInterface`는 임의 페이지 노출 시 공격면이 된다 | 네비게이션 allowlist와 브리지 활성 범위를 SDK가 강제한다. |
| R4 | HMAC을 앱에서 생성하면 secret 유출 | 서버 서명만 허용하며 SDK API에 secret 인자를 만들지 않는다. |
| R5 | 앱·위젯의 독립 배포로 호환성이 깨질 수 있음 | SDK/브리지 SemVer 및 호환 매트릭스를 릴리스 산출물로 관리한다. |
| R6 | WebView 캐시가 오래된 위젯 진입 HTML을 사용할 수 있음 | 위젯 진입 자산 캐시 정책과 SDK의 강제 새로고침/장애 진단 필요성을 PLN에서 검토한다. |
| R7 | go2joy 앱의 인증·딥링크·네비게이션 구조를 이 저장소에서 알 수 없음 | 실제 앱 담당자와 공개 API·콜백·UAT 시나리오를 확정한 뒤 구현한다. |

## 7. 열린 결정 (PLN에서 확정)

| ID | 결정할 것 | 권장 |
|---|---|---|
| D1 | 최소/대상 Android API, Kotlin·AGP·JDK 버전 | go2joy의 실제 지원 매트릭스에 맞춘다. 추정값으로 SDK 기준을 고정하지 않는다. |
| D2 | UI 제공 형태 | `ShopTalkFragment`를 기본 제공하고, Compose host용 wrapper는 별도 adapter로 둔다. View와 Compose를 동시에 핵심 구현으로 만들지 않는다. |
| D3 | 이벤트 API | 생명주기 결합이 단순한 listener를 기본으로 하고, 필요 시 `Flow` adapter를 추가한다. |
| D4 | Maven 배포 위치/접근제어 | go2joy만 사용하는 비공개 Maven registry를 기본으로 한다. 공개 배포는 라이선스·지원 정책 후 별도 결정한다. |
| D5 | WebView 세션 삭제 시점 | 로그아웃과 개인정보 삭제를 구분한다. 탈퇴/삭제는 저장소 제거, 단순 로그아웃은 위젯의 `logout` 계약을 기본으로 한다. |
| D6 | 파일 선택 범위 | 사진만 우선 지원할지, 카메라 촬영·문서·다중 선택까지 제공할지 go2joy의 상담 첨부 정책으로 확정한다. |
| D7 | 위젯 배포 장애 대응 | 캐시된 진입 파일/최소 위젯 버전 진단을 SDK에 둘지, 위젯 CDN 정책만으로 보장할지 결정한다. |

## 8. 다음 단계

승인 후 `PLN-260826-Go2Joy-Kotlin-Mobile-SDK.md`를 작성한다. 계획에는 Android SDK 모듈 구조,
공개 API/이벤트 계약, URL·브리지 보안 정책, AAR 배포 파이프라인, go2joy 샘플 앱, ASCII
와이어프레임, 테스트·실기기 UAT 기준을 포함한다. PLN 승인 전 구현에는 착수하지 않는다.

# ShopTalk Android SDK

고객사 코틀린 앱 안에 ShopTalk 상담 화면을 넣는 Android 라이브러리(AAR).
웹과 **같은 위젯**을 WebView로 띄우고, 앱과 위젯은 브리지 메시지만 주고받는다
(계약: `docs/guide/모바일SDK연동가이드_Mobile-SDK.ko.md`).

- 모듈: `:shoptalk` (라이브러리 → AAR) · `:sample` (검증용 앱, 전달물 아님)
- minSdk 24 · compileSdk 35 · 의존성은 androidx 기본군(core-ktx, fragment-ktx)뿐
  — AAR에는 POM이 없으므로 **호스트 앱이 이미 가진 것만** 쓴다.

## 빌드

npm 워크스페이스와 완전히 분리된 독립 Gradle 프로젝트다 (`package.json` 없음 — 두지 말 것,
루트 CI가 Node 전용이라 이 디렉터리를 인식하지 않는 것이 의도된 상태).

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"  # JDK 17+
export ANDROID_HOME="$HOME/Library/Android/sdk"

./gradlew :shoptalk:testReleaseUnitTest          # JVM 단위 테스트 (계약 커버)
./gradlew :shoptalk:assembleRelease              # → shoptalk/build/outputs/aar/shoptalk-release.aar
./gradlew :sample:installDebug                   # 실기기/에뮬레이터 검증용
```

## 전달 (AAR 직접 전달)

```bash
./gradlew :shoptalk:assembleRelease
cp shoptalk/build/outputs/aar/shoptalk-release.aar dist/shoptalk-android-<버전>.aar
```

버전은 `docs/plan/PLN-260827-Kotlin-Android-SDK.md` 기준 `0.1.0`부터. AAR과 함께
연동 가이드(§ "AAR로 붙기")를 전달한다. **AAR·secret·서명 해시는 리포에 커밋하지 않는다.**

## 호스트 앱 통합 (요약)

```kotlin
// libs/에 AAR 복사 후
dependencies {
    implementation(files("libs/shoptalk-android-0.1.0.aar"))
    implementation("androidx.core:core-ktx:1.15.0")       // 이미 있다면 생략
    implementation("androidx.fragment:fragment-ktx:1.8.5") // 이미 있다면 생략
}
```

```kotlin
val chat = ShopTalkChatFragment.newInstance(
    ShopTalkConfig(
        widgetUrl = "https://shoptalk.amoeba.site/widget/",
        shop = "<테넌트 식별 값>",
        locale = "vi",
        agent = null, // AI 에이전트 코드(선택)
    )
)
chat.identify(ShopTalkUser(userId = uid, hash = serverSignedHash))
chat.listener = object : ShopTalkListener {
    override fun onCloseRequest() { supportFragmentManager.popBackStack() } // 필수
    override fun onIdentified(ok: Boolean) {}
}
supportFragmentManager.commit { replace(R.id.container, chat) }
```

라이브러리가 대신 처리하는 것: 파일 선택기(`onShowFileChooser`), 외부 링크 시스템 브라우저,
키보드(adjustResize + IME 인셋), DOM storage(세션 유지), 로딩 표시, 회전 시 WebView 상태
복원, 위젯 준비 전 명령 큐(20건), 페이지 리로드 시 identify 자동 재전송.

호스트가 여전히 지켜야 하는 것:

| 항목 | 이유 |
|---|---|
| `onCloseRequest`에서 화면 닫기 | 앱에서는 위젯이 화면 전체 — 안 닫으면 빈 화면 |
| `hash`는 서버에서 서명 | `HMAC_SHA256(embed_secret, userId)`. 시크릿을 앱에 넣으면 번들에서 추출된다 |
| minify 시 consumer rules 유지 | AAR에 포함됨(`@JavascriptInterface` keep) — 별도 조치 불요, 지우지만 말 것 |

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "site.amoeba.shoptalk"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        // android.util.Log in JVM tests returns defaults instead of throwing.
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    // Hand-delivered AAR: dependencies must stay inside the androidx baseline any
    // host app already has — the AAR carries no POM to pull anything else in.
    implementation("androidx.core:core-ktx:1.15.0")
    // `api`, not `implementation`: ShopTalkChatFragment extends Fragment, so the
    // type is part of this library's public surface and consumers compile against it.
    api("androidx.fragment:fragment-ktx:1.8.5")

    testImplementation("junit:junit:4.13.2")
    // Real org.json on the test classpath — the android.jar stub throws.
    testImplementation("org.json:json:20240303")
}

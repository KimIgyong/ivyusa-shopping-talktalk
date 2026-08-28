// Versions are pinned to what the team toolchain already carries: AGP 8.5.x pairs
// with the Gradle 8.7 wrapper, and the library must stay buildable offline once
// the caches are warm — this AAR is hand-delivered, not fetched by consumers.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("com.android.library") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
}

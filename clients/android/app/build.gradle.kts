plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from environment variables, never from the repository.
val keystorePath: String? = System.getenv("HEARTBEAT_ANDROID_KEYSTORE")

android {
    namespace = "uk.co.heartbeatart.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "uk.co.heartbeatart.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.1.0"
    }
    signingConfigs {
        if (keystorePath != null) create("release") {
            storeFile = file(keystorePath)
            storePassword = System.getenv("HEARTBEAT_ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("HEARTBEAT_ANDROID_KEY_ALIAS") ?: "heartbeat"
            keyPassword = System.getenv("HEARTBEAT_ANDROID_KEY_PASSWORD") ?: System.getenv("HEARTBEAT_ANDROID_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

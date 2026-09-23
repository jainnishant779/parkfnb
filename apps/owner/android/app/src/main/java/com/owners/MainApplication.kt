package com.owners

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import com.owners.ota.OtaPackage
import java.io.File

class MainApplication : Application(), ReactApplication {

  private val otaBundlePath: String?
    get() {
      val bundleFile = File(filesDir, "ota/index.android.bundle")
      return if (bundleFile.exists() && bundleFile.length() > 0) {
        bundleFile.absolutePath
      } else {
        null
      }
    }

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(OtaPackage())
        },
      jsBundleFilePath = otaBundlePath,
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Canonical RN 0.82+ entry point. The previous template used
    // `ReactNativeApplicationEntryPoint.loadReactNative(this)` which is not
    // a real RN API in this version and fails to compile from a clean cache.
    SoLoader.init(this, OpenSourceMergedSoMapping)
    // Urbanist as a weighted family so fontFamily 'Urbanist' + fontWeight resolves.
    ReactFontManager.getInstance().addCustomFont(this, "Urbanist", R.font.urbanist)
    load()
  }
}

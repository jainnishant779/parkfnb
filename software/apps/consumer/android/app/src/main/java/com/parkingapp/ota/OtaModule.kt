package com.parkingapp.ota

import android.content.Intent
import android.os.Process
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class OtaModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "OtaModule"

  @ReactMethod
  fun getBundleInfo(promise: Promise) {
    try {
      val otaDir = File(reactContext.filesDir, "ota")
      val bundleFile = File(otaDir, "index.android.bundle")
      val metaFile = File(otaDir, "meta.json")

      val map = Arguments.createMap()
      val exists = bundleFile.exists() && bundleFile.length() > 0
      map.putBoolean("hasOtaBundle", exists)
      map.putString("bundlePath", if (exists) bundleFile.absolutePath else "")
      map.putString("meta", if (metaFile.exists()) metaFile.readText() else "")
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("ERR_OTA", e.message)
    }
  }

  @ReactMethod
  fun downloadAndApply(urlStr: String, metaJson: String, promise: Promise) {
    Thread {
      try {
        val otaDir = File(reactContext.filesDir, "ota")
        if (!otaDir.exists()) {
          otaDir.mkdirs()
        }

        val tempFile = File(otaDir, "download.temp")
        val bundleFile = File(otaDir, "index.android.bundle")
        val metaFile = File(otaDir, "meta.json")

        val url = URL(urlStr)
        val conn = url.openConnection() as HttpURLConnection
        conn.connectTimeout = 30000
        conn.readTimeout = 60000
        conn.instanceFollowRedirects = true
        conn.connect()

        if (conn.responseCode !in 200..299) {
          promise.reject("ERR_HTTP", "Server returned HTTP ${conn.responseCode}")
          return@Thread
        }

        conn.inputStream.use { input ->
          FileOutputStream(tempFile).use { output ->
            input.copyTo(output)
          }
        }

        if (!tempFile.exists() || tempFile.length() < 1000) {
          tempFile.delete()
          promise.reject("ERR_CORRUPT", "Downloaded bundle is invalid or too small")
          return@Thread
        }

        // Atomically replace existing bundle
        if (bundleFile.exists()) {
          bundleFile.delete()
        }
        tempFile.renameTo(bundleFile)
        metaFile.writeText(metaJson)

        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_DOWNLOAD", e.message)
      }
    }.start()
  }

  @ReactMethod
  fun restartApp() {
    try {
      val pm = reactContext.packageManager
      val intent = pm.getLaunchIntentForPackage(reactContext.packageName)
      if (intent != null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
        Process.killProcess(Process.myPid())
      }
    } catch (e: Exception) {
      // Fallback
      Process.killProcess(Process.myPid())
    }
  }

  @ReactMethod
  fun rollback(promise: Promise) {
    try {
      val otaDir = File(reactContext.filesDir, "ota")
      if (otaDir.exists()) {
        otaDir.deleteRecursively()
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERR_ROLLBACK", e.message)
    }
  }
}

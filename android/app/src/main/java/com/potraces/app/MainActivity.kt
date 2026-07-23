package com.potraces.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import java.io.File

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import com.potraces.app.share.ShareStore

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    // Share-to-Log: a screenshot shared while the app was cold arrives on the
    // launch intent — stash it for JS to drain via getInitialShare().
    handleShareIntent(intent)
  }

  // singleTask: a share while the app is already running does NOT create a new
  // Activity — it hits onNewIntent (getIntent() would still return the launch
  // intent). Update the stored intent and forward the shared image to JS.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleShareIntent(intent)
  }

  private fun handleShareIntent(intent: Intent?) {
    if (intent == null) return
    val action = intent.action ?: return
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
    if (intent.type?.startsWith("image/") != true) return

    val uri: Uri? = if (action == Intent.ACTION_SEND) {
      if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }
    } else {
      val list = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION") intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
      }
      list?.firstOrNull()
    }
    if (uri == null) return

    // The read grant on this content:// Uri is task-scoped and expires — copy the
    // bytes to our own cache NOW, then hand JS a stable file:// path it can OCR.
    val cached = copyToCache(uri) ?: return
    ShareStore.deliver("file://" + cached.absolutePath)
  }

  private fun copyToCache(uri: Uri): File? {
    return try {
      val input = contentResolver.openInputStream(uri) ?: return null
      val out = File(cacheDir, "share_" + System.currentTimeMillis() + ".jpg")
      input.use { i -> out.outputStream().use { o -> i.copyTo(o) } }
      out
    } catch (e: Exception) {
      null
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}

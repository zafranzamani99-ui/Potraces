package com.potraces.app.share

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Bridges a shared image from the Activity thread (where a SEND intent arrives) to
 * JS, decoupling intent arrival from JS readiness.
 *
 * MainActivity copies the shared image to cache and calls [deliver] with a file://
 * path. If a JS listener is already live (warm share → onNewIntent) we emit the
 * "PotracesShareImage" event immediately; otherwise (cold start → the React
 * instance isn't up yet) we stash the path in [pending], and JS drains it via
 * getInitialShare()/[takeInitial]. This mirrors Linking's getInitialURL() (cold)
 * vs the 'url' event (warm) split.
 */
object ShareStore {
  @Volatile private var pending: String? = null
  @Volatile private var reactContext: ReactApplicationContext? = null

  /** Called from ShareModule.initialize() once JS can be reached. */
  fun attach(ctx: ReactApplicationContext) {
    reactContext = ctx
  }

  @Synchronized
  fun deliver(uri: String) {
    val rc = reactContext
    if (rc != null && rc.hasActiveReactInstance()) {
      rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("PotracesShareImage", uri)
    } else {
      pending = uri
    }
  }

  /** Cold-start read: return and clear any stashed share. */
  @Synchronized
  fun takeInitial(): String? {
    val p = pending
    pending = null
    return p
  }
}

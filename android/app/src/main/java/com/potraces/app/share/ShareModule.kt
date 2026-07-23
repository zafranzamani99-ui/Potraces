package com.potraces.app.share

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS-facing surface of the Android Share-to-Log bridge. Exposes:
 *  - getInitialShare(): the file:// path of a screenshot shared while the app was
 *    cold (or null), read once on mount — the analog of Linking.getInitialURL().
 *  - the "PotracesShareImage" DeviceEventEmitter event for warm shares.
 */
class ShareModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PotracesShare"

  override fun initialize() {
    super.initialize()
    ShareStore.attach(reactContext)
  }

  @ReactMethod
  fun getInitialShare(promise: Promise) {
    promise.resolve(ShareStore.takeInitial())
  }

  // Required by NativeEventEmitter (no-ops) — without these, new architecture
  // logs an "addListener/removeListeners not implemented" warning.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}
}

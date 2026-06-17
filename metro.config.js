// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withShareExtension } = require('expo-share-extension/metro');

// withShareExtension lets Metro bundle the separate `index.share.js` entry for the
// iOS share-extension target alongside the main app. Preserves Expo's default config.
module.exports = withShareExtension(getDefaultConfig(__dirname));

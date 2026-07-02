import { registerRootComponent } from 'expo';

import App from './App';

// Replaces the default `expo/AppEntry.js` so the share extension can register its
// own entry point (`index.share.js`) alongside the main app. Behaviour is identical.
registerRootComponent(App);

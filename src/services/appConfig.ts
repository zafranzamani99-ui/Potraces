import * as Application from 'expo-application';
import { Platform } from 'react-native';

// Remote app-config drives the forced-update / kill-switch gate. It is a plain
// static JSON hosted on the marketing site (Vercel). To require an update, raise
// `minVersion` above the shipped app version and redeploy the JSON — no app
// release needed. Swap the host to jejakbaki.my once you prefer the branded
// domain (any fetch failure simply fails open — see below).
const CONFIG_URL = 'https://potraces.vercel.app/app-config.json';
const FETCH_TIMEOUT_MS = 4000;

export interface AppRemoteConfig {
  minVersion?: string;       // installed < minVersion -> force update
  latestVersion?: string;    // informational
  message?: string;          // optional override for the gate copy
  ios?: { url?: string };    // App Store URL
  android?: { url?: string };// Play Store URL
}

export interface UpdateStatus {
  required: boolean;
  storeUrl?: string;
  message?: string;
}

/**
 * Numeric semver-ish compare. Returns 1 if a>b, -1 if a<b, 0 if equal.
 * Non-numeric segments degrade to 0 (e.g. "1.0.0-beta" -> [1,0,0]), so a
 * malformed version can never *raise* the comparison and trigger a false block.
 */
function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Decide whether the installed build is below the remote minimum.
 *
 * FAIL-OPEN CONTRACT: every failure path (no version, network error, timeout,
 * non-2xx, malformed JSON, missing minVersion) returns { required: false }.
 * A config-server outage or a bad config must NEVER lock users out of their
 * money. The gate only blocks when we POSITIVELY confirm installed < minVersion.
 */
export async function checkForcedUpdate(): Promise<UpdateStatus> {
  try {
    const installed = Application.nativeApplicationVersion; // e.g. "1.0.0"
    if (!installed) return { required: false };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(CONFIG_URL, { signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { required: false };

    const cfg = (await res.json()) as AppRemoteConfig;
    if (!cfg?.minVersion) return { required: false };
    if (compareVersions(installed, cfg.minVersion) >= 0) return { required: false };

    const storeUrl = Platform.OS === 'ios' ? cfg.ios?.url : cfg.android?.url;
    return { required: true, storeUrl, message: cfg.message };
  } catch {
    return { required: false };
  }
}

/**
 * AI opt-in (PDPA consent gate) — the master switch for every AI feature.
 *
 * When `aiOptInEnabled` is false, NOTHING may leave the device for AI
 * processing (Echo/MoneyChat, receipt scanning, statement import, note
 * extraction, business AI reports, voice transcription). The enforcement is
 * layered:
 *
 *   1. Transport gate — geminiClient.isGeminiAvailable() returns false when
 *      opted out (via aiOptIn.ts), so callGeminiAPI returns null and
 *      streamGeminiText throws "AI unavailable": every caller degrades
 *      through its existing unavailable-AI fallback. statementImport's
 *      parseStatement returns a coded 'ai_off' error.
 *   2. Entry-point consent — the main AI entry points (Echo send, receipt
 *      scan, statement import) call requestAiAccess() first, which shows the
 *      consent dialog and flips the setting on "Turn on".
 *   3. Settings — the "AI features" row (PersonalSettings/BusinessSettings)
 *      is the always-available off switch.
 *
 * Screen/UI modules only: importing this pulls react-native, which tsx test
 * scripts cannot load — services that need the flag read aiOptIn.ts instead.
 *
 * Copy points at Google (Gemini) only — the Anthropic path was retired.
 */
import { Alert } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import type { Translations } from '../i18n';

/**
 * Consent gate for AI entry points. Already opted in → resolves true
 * immediately. Otherwise shows the consent dialog: "Turn on" flips the global
 * setting and resolves true; cancel resolves false (the caller leaves the
 * feature alone — the transport gate backstops any later call).
 */
export function requestAiAccess(tr: Translations): Promise<boolean> {
  if (useSettingsStore.getState().aiOptInEnabled) return Promise.resolve(true);
  return new Promise((resolve) => {
    Alert.alert(
      tr.settings.aiConsentTitle,
      tr.settings.aiConsentMsg,
      [
        { text: tr.common.cancel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: tr.settings.aiConsentAllow,
          onPress: () => {
            useSettingsStore.getState().setAiOptInEnabled(true);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Hook for voice input — records audio via expo-audio,
 * transcribes via Gemini 2.0 Flash, returns text.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File as ExpoFile } from 'expo-file-system';
import { usePremiumStore } from '../store/premiumStore';
import { callGeminiAPI, isGeminiAvailable } from '../services/geminiClient';

interface UseVoiceInputReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permissionGrantedRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Cleanup on unmount — stop recorder and reset audio mode
  useEffect(() => {
    return () => {
      try {
        recorder.stop();
        setAudioModeAsync({ allowsRecording: false });
      } catch {
        // Already stopped or not started
      }
    };
  }, [recorder]);

  const startRecording = useCallback(async () => {
    setError(null);

    try {
      // Request permission if not yet granted
      if (!permissionGrantedRef.current) {
        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted) {
          setError('microphone permission needed');
          return;
        }
        permissionGrantedRef.current = true;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      recorder.record();
      setIsRecording(true);
    } catch (err) {
      console.warn('[useVoiceInput] Start recording failed:', err);
      setError('could not start recording');
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!isRecording) return null;

    setIsRecording(false);
    setIsTranscribing(true);
    setError(null);

    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (!uri) {
        setError('no recording captured');
        return null;
      }

      // Check AI availability (key + cooldown + quota)
      if (!isGeminiAvailable()) {
        setError('AI temporarily unavailable');
        return null;
      }
      const premium = usePremiumStore.getState();
      if (!premium.canUseAI()) {
        setError('ai limit reached — upgrade for unlimited');
        return null;
      }

      // Read audio file as base64
      const file = new ExpoFile(uri);
      const base64Audio = await file.base64();

      // Send to Gemini for transcription
      const data = await callGeminiAPI({
        contents: [
          {
            parts: [
              {
                text: 'Transcribe this audio. The speaker may use Malay, English, or Manglish (mixed). Return ONLY the transcription text, nothing else. If you cannot hear anything, return an empty string.',
              },
              {
                inlineData: {
                  mimeType: 'audio/m4a',
                  data: base64Audio,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      });

      if (!data) {
        setError('transcription failed');
        return null;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (text) {
        premium.incrementAiCalls();
        return text;
      }

      setError('no speech detected');
      return null;
    } catch (err) {
      console.warn('[useVoiceInput] Transcription failed:', err);
      setError('transcription failed');
      return null;
    } finally {
      setIsTranscribing(false);
      await setAudioModeAsync({ allowsRecording: false });
    }
  }, [isRecording, recorder]);

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopAndTranscribe,
  };
}

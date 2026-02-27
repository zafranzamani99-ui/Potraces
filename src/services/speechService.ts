import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_SPEECH_API_KEY || '';
const API_URL = 'https://speech.googleapis.com/v1/speech:recognize';

/**
 * Transcribes audio to text using Google Cloud Speech-to-Text.
 * Primary language: ms-MY (Malay), alternative: en-MY (English Malaysia).
 * Never throws — returns null on failure.
 */
export async function transcribeAudio(audioUri: string): Promise<string | null> {
  try {
    if (!API_KEY) {
      return null;
    }

    const base64 = await readAsStringAsync(audioUri, {
      encoding: EncodingType.Base64,
    });

    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 44100,
          languageCode: 'ms-MY',
          alternativeLanguageCodes: ['en-MY'],
          enableAutomaticPunctuation: true,
        },
        audio: { content: base64 },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    const transcript =
      data?.results?.[0]?.alternatives?.[0]?.transcript || null;

    return transcript;
  } catch {
    return null;
  }
}

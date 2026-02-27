import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';
const API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Extracts text from an image using Google Cloud Vision OCR.
 * Never throws — returns null on failure.
 */
export async function recognizeText(imageUri: string): Promise<string | null> {
  try {
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
      return null;
    }

    const base64 = await readAsStringAsync(imageUri, {
      encoding: EncodingType.Base64,
    });

    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION' }],
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    const text =
      data?.responses?.[0]?.fullTextAnnotation?.text ||
      data?.responses?.[0]?.textAnnotations?.[0]?.description ||
      null;

    return text;
  } catch {
    return null;
  }
}

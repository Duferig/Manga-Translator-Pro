import { GoogleGenAI, Type } from '@google/genai';
import type { PageRecord, ProjectSettings, TextRegion } from '../types';

const getBase64Payload = (dataUrl: string) => {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  return { mimeType, data };
};

const parseJson = <T>(text: string | undefined, fallback: T): T => {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

const makeClient = (apiKey: string) => {
  if (!apiKey.trim()) {
    throw new Error('Gemini API key is required for OCR fallback.');
  }
  return new GoogleGenAI({ apiKey });
};

type OcrItem = {
  regionId: string;
  sourceText: string;
  confidence?: number;
  notes?: string;
};

type OcrResponse = {
  items: OcrItem[];
};

export const runOcrFallback = async (
  page: PageRecord,
  settings: ProjectSettings,
  onlyEmptySource = true
): Promise<TextRegion[]> => {
  const regions = onlyEmptySource
    ? page.regions.filter((region) => !region.sourceText.trim())
    : page.regions;

  if (!regions.length) {
    return page.regions;
  }

  const ai = makeClient(settings.apiKey);
  const { mimeType, data } = getBase64Payload(page.imageDataUrl);

  const response = await ai.models.generateContent({
    model: settings.visionModel,
    contents: {
      parts: [
        { inlineData: { data, mimeType } },
        {
          text: [
            'You are an OCR fallback pass for manga/manhwa regions.',
            'Read text only inside the provided normalized boxes.',
            'Do not translate.',
            'Keep line breaks only when important.',
            'Return JSON object with items: [{ regionId, sourceText, confidence, notes }].',
            `Target regions: ${JSON.stringify(
              regions.map((region) => ({
                regionId: region.id,
                bbox: region.bbox,
                kind: region.kind,
                notes: region.notes ?? ''
              })),
              null,
              2
            )}`
          ].join('\n')
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                regionId: { type: Type.STRING },
                sourceText: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                notes: { type: Type.STRING }
              },
              required: ['regionId', 'sourceText']
            }
          }
        },
        required: ['items']
      }
    }
  });

  const parsed = parseJson<OcrResponse>(response.text, { items: [] });
  const map = new Map(parsed.items.map((item) => [item.regionId, item]));

  return page.regions.map((region) => {
    const hit = map.get(region.id);
    if (!hit) return region;
    return {
      ...region,
      sourceText: hit.sourceText?.trim() || region.sourceText,
      confidence: hit.confidence ?? region.confidence,
      notes: [region.notes, hit.notes].filter(Boolean).join(' | ')
    };
  });
};

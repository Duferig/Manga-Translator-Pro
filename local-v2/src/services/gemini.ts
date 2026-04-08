import { GoogleGenAI, Type } from '@google/genai';
import type { PageRecord, ProjectSettings, TextRegion } from '../types';
import { uid } from '../lib/file';

type DetectedRegion = {
  bbox: { x: number; y: number; w: number; h: number };
  sourceText: string;
  kind: TextRegion['kind'];
  notes?: string;
  confidence?: number;
};

type TranslationItem = {
  regionId: string;
  translatedText: string;
};

type TranslationResponse = {
  pageSummary?: string;
  glossaryUpdates?: Record<string, string>;
  translations?: TranslationItem[];
};

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

const clampBox = (value: number) => Math.min(1, Math.max(0, value));

const ensureRegion = (input: DetectedRegion): TextRegion => ({
  id: uid(),
  bbox: {
    x: clampBox(input.bbox?.x ?? 0.05),
    y: clampBox(input.bbox?.y ?? 0.05),
    w: clampBox(input.bbox?.w ?? 0.2),
    h: clampBox(input.bbox?.h ?? 0.1)
  },
  sourceText: input.sourceText?.trim() ?? '',
  translatedText: '',
  kind: input.kind ?? 'unknown',
  notes: input.notes?.trim() ?? '',
  confidence: input.confidence
});

const makeClient = (apiKey: string) => {
  if (!apiKey.trim()) {
    throw new Error('Gemini API key is required.');
  }

  return new GoogleGenAI({ apiKey });
};

export const detectRegions = async (
  page: PageRecord,
  settings: ProjectSettings
): Promise<TextRegion[]> => {
  const ai = makeClient(settings.apiKey);
  const { mimeType, data } = getBase64Payload(page.imageDataUrl);

  const prompt = [
    'Task: inspect the manga/manhwa page and detect readable text regions.',
    `Source language hint: ${settings.sourceLanguageHint || 'unknown'}.`,
    'Return only JSON array.',
    'Each item must include:',
    '- bbox.x, bbox.y, bbox.w, bbox.h normalized from 0 to 1',
    '- sourceText',
    '- kind: speech | sfx | narration | sign | unknown',
    '- confidence from 0 to 1',
    '- notes',
    'Rules:',
    '- detect only visible text regions',
    '- do not merge distant bubbles',
    '- if unsure, still include region with lower confidence',
    '- keep source text exactly as seen'
  ].join('\n');

  const response = await ai.models.generateContent({
    model: settings.visionModel,
    contents: {
      parts: [{ inlineData: { data, mimeType } }, { text: prompt }]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            bbox: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                w: { type: Type.NUMBER },
                h: { type: Type.NUMBER }
              },
              required: ['x', 'y', 'w', 'h']
            },
            sourceText: { type: Type.STRING },
            kind: {
              type: Type.STRING,
              enum: ['speech', 'sfx', 'narration', 'sign', 'unknown']
            },
            confidence: { type: Type.NUMBER },
            notes: { type: Type.STRING }
          },
          required: ['bbox', 'sourceText', 'kind']
        }
      }
    }
  });

  const parsed = parseJson<DetectedRegion[]>(response.text, []);
  return parsed.map(ensureRegion).filter((region) => region.sourceText || region.notes);
};

export const translateRegions = async (
  page: PageRecord,
  projectName: string,
  glossary: Record<string, string>,
  recentSummaries: string[],
  settings: ProjectSettings
): Promise<TranslationResponse> => {
  const ai = makeClient(settings.apiKey);

  const payload = {
    projectName,
    pageName: page.name,
    targetLanguage: settings.targetLanguage,
    tone: settings.tone,
    recentContext: recentSummaries,
    glossary,
    regions: page.regions.map((region) => ({
      regionId: region.id,
      kind: region.kind,
      sourceText: region.sourceText,
      notes: region.notes ?? ''
    }))
  };

  const prompt = [
    'You are translating manga/manhwa text for a local-only editor.',
    `Target language: ${settings.targetLanguage}.`,
    `Preferred tone: ${settings.tone}.`,
    'Use glossary terms exactly when relevant.',
    'Preserve speaker intent, pacing, and sound-effect flavor.',
    'Return only JSON object with:',
    '- pageSummary: short 1 sentence summary',
    '- glossaryUpdates: object of new canonical terms',
    '- translations: array of { regionId, translatedText }'
  ].join('\n');

  const response = await ai.models.generateContent({
    model: settings.textModel,
    contents: [{ text: `${prompt}\n\nINPUT:\n${JSON.stringify(payload, null, 2)}` }],
    config: {
      responseMimeType: 'application/json'
    }
  });

  return parseJson<TranslationResponse>(response.text, {});
};

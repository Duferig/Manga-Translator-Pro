import type { ProjectData, ProjectSettings } from '../types';
import { uid } from './file';

const defaultSettings: ProjectSettings = {
  apiKey: '',
  visionModel: 'gemini-3-flash-preview',
  textModel: 'gemini-3-flash-preview',
  targetLanguage: 'Russian',
  sourceLanguageHint: 'Japanese or Korean or English',
  tone: 'Natural manga dialogue with clear character voice'
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeImportedProject = (value: unknown): ProjectData => {
  if (!isObject(value)) {
    throw new Error('Imported JSON is not an object.');
  }

  const settings = isObject(value.settings) ? value.settings : {};
  const pages = Array.isArray(value.pages) ? value.pages : [];

  return {
    id: typeof value.id === 'string' ? value.id : uid(),
    name: typeof value.name === 'string' ? value.name : 'Imported Project',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    glossary: isObject(value.glossary)
      ? Object.fromEntries(Object.entries(value.glossary).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {},
    settings: {
      apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : defaultSettings.apiKey,
      visionModel: typeof settings.visionModel === 'string' ? settings.visionModel : defaultSettings.visionModel,
      textModel: typeof settings.textModel === 'string' ? settings.textModel : defaultSettings.textModel,
      targetLanguage: typeof settings.targetLanguage === 'string' ? settings.targetLanguage : defaultSettings.targetLanguage,
      sourceLanguageHint: typeof settings.sourceLanguageHint === 'string' ? settings.sourceLanguageHint : defaultSettings.sourceLanguageHint,
      tone: typeof settings.tone === 'string' ? settings.tone : defaultSettings.tone
    },
    pages: pages
      .filter(isObject)
      .map((page, index) => ({
        id: typeof page.id === 'string' ? page.id : uid(),
        name: typeof page.name === 'string' ? page.name : `Imported Page ${index + 1}`,
        pageNumber: typeof page.pageNumber === 'number' ? page.pageNumber : index + 1,
        imageDataUrl: typeof page.imageDataUrl === 'string' ? page.imageDataUrl : '',
        regions: Array.isArray(page.regions)
          ? page.regions
              .filter(isObject)
              .map((region) => ({
                id: typeof region.id === 'string' ? region.id : uid(),
                bbox: isObject(region.bbox)
                  ? {
                      x: typeof region.bbox.x === 'number' ? region.bbox.x : 0.1,
                      y: typeof region.bbox.y === 'number' ? region.bbox.y : 0.1,
                      w: typeof region.bbox.w === 'number' ? region.bbox.w : 0.2,
                      h: typeof region.bbox.h === 'number' ? region.bbox.h : 0.1
                    }
                  : { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
                sourceText: typeof region.sourceText === 'string' ? region.sourceText : '',
                translatedText: typeof region.translatedText === 'string' ? region.translatedText : '',
                kind:
                  region.kind === 'speech' ||
                  region.kind === 'sfx' ||
                  region.kind === 'narration' ||
                  region.kind === 'sign' ||
                  region.kind === 'unknown'
                    ? region.kind
                    : 'unknown',
                notes: typeof region.notes === 'string' ? region.notes : '',
                confidence: typeof region.confidence === 'number' ? region.confidence : undefined
              }))
          : [],
        summary: typeof page.summary === 'string' ? page.summary : '',
        detectionStatus:
          page.detectionStatus === 'idle' || page.detectionStatus === 'loading' || page.detectionStatus === 'done' || page.detectionStatus === 'error'
            ? page.detectionStatus
            : 'idle',
        translationStatus:
          page.translationStatus === 'idle' || page.translationStatus === 'loading' || page.translationStatus === 'done' || page.translationStatus === 'error'
            ? page.translationStatus
            : 'idle',
        errorMessage: typeof page.errorMessage === 'string' ? page.errorMessage : undefined
      }))
  };
};

export const readProjectFromFile = async (file: File): Promise<ProjectData> => {
  const text = await file.text();
  return normalizeImportedProject(JSON.parse(text));
};

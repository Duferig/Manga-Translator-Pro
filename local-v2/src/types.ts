export type RegionKind = 'speech' | 'sfx' | 'narration' | 'sign' | 'unknown';
export type AsyncStatus = 'idle' | 'loading' | 'done' | 'error';

export interface BBoxNorm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextRegion {
  id: string;
  bbox: BBoxNorm;
  sourceText: string;
  translatedText: string;
  kind: RegionKind;
  notes?: string;
  confidence?: number;
}

export interface PageRecord {
  id: string;
  name: string;
  pageNumber: number;
  imageDataUrl: string;
  regions: TextRegion[];
  summary: string;
  detectionStatus: AsyncStatus;
  translationStatus: AsyncStatus;
  errorMessage?: string;
}

export interface ProjectSettings {
  apiKey: string;
  visionModel: string;
  textModel: string;
  targetLanguage: string;
  sourceLanguageHint: string;
  tone: string;
}

export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: PageRecord[];
  glossary: Record<string, string>;
  settings: ProjectSettings;
}

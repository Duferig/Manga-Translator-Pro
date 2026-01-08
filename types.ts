export interface MangaPage {
  id: string;
  originalFile: File;
  originalUrl: string;
  translatedUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  pageNumber: number; // Derived from filename
}

export interface ProcessingStats {
  total: number;
  completed: number;
  current: number;
}

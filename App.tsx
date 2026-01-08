import React, { useState, useEffect, useCallback } from 'react';
import ApiKeySelector from './components/ApiKeySelector';
import FileUploader from './components/FileUploader';
import MangaReader from './components/MangaReader';
import { MangaPage } from './types';
import { fileToBase64, translateMangaPage, splitLongImage, resetSessionMemory } from './services/geminiService';
import { translations } from './translations';

// Increased concurrency for better throughput
const CONCURRENCY_LIMIT = 5;
// Strict rate limit to avoid API errors (20 requests per minute)
const RPM_LIMIT = 20;

type AppMode = 'manga' | 'manhwa';
type SortOrder = 'asc' | 'desc';
type TargetLanguage = 'ru' | 'en';
type UiLanguage = 'ru' | 'en';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState(false);
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  
  // Rate Limiting State
  const [requestHistory, setRequestHistory] = useState<number[]>([]);
  
  // Configuration State
  const [appMode, setAppMode] = useState<AppMode>('manga');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>('ru');
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('ru');

  const t = translations[uiLanguage];

  const extractNumber = (filename: string): number => {
    const match = filename.match(/(\d+)/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode);
    if (mode === 'manhwa') {
      setSortOrder('asc'); 
    } else {
      setSortOrder('desc'); 
    }
  };

  const handleFilesSelected = async (fileList: FileList) => {
    // RESET MEMORY for new session
    resetSessionMemory();
    
    setIsPreparing(true);
    const rawFiles = Array.from(fileList);
    
    // 1. Sort files
    rawFiles.sort((a, b) => {
      const numA = extractNumber(a.name);
      const numB = extractNumber(b.name);
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    const newPages: MangaPage[] = [];

    // 2. Process files
    for (const file of rawFiles) {
       try {
         let chunks: File[] = [];

         if (appMode === 'manhwa') {
            chunks = await splitLongImage(file);
         } else {
            chunks = [file];
         }
         
         chunks.forEach((chunkFile) => {
            newPages.push({
              id: Math.random().toString(36).substr(2, 9),
              originalFile: chunkFile,
              originalUrl: URL.createObjectURL(chunkFile),
              translatedUrl: null,
              status: 'pending',
              pageNumber: extractNumber(file.name),
            });
         });
       } catch (err) {
         console.error("Error preparing file:", file.name, err);
         newPages.push({
            id: Math.random().toString(36).substr(2, 9),
            originalFile: file,
            originalUrl: URL.createObjectURL(file),
            translatedUrl: null,
            status: 'pending',
            pageNumber: extractNumber(file.name),
         });
       }
    }

    setPages(newPages);
    setIsPreparing(false);
  };

  const processPage = useCallback(async (page: MangaPage) => {
    try {
      const base64 = await fileToBase64(page.originalFile);
      const url = await translateMangaPage(base64, page.originalFile.type, targetLanguage);
      
      setPages(prev => prev.map(p => 
        p.id === page.id 
          ? { ...p, status: 'completed', translatedUrl: url } 
          : p
      ));
    } catch (error) {
      console.error(`Error processing page ${page.pageNumber}:`, error);
      setPages(prev => prev.map(p => 
        p.id === page.id 
          ? { ...p, status: 'error' } 
          : p
      ));
    }
  }, [targetLanguage]);

  const handleRegenerate = (pageId: string) => {
    setPages(prev => prev.map(p => {
      if (p.id === pageId) {
        return { ...p, status: 'pending', translatedUrl: null };
      }
      return p;
    }));
  };

  // Periodically clean up old timestamps to prevent memory leaks and keep state clean
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRequestHistory(prev => {
        const filtered = prev.filter(t => now - t < 60000);
        // Only update if array length changes to minimize re-renders
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Main Scheduler
  useEffect(() => {
    if (!hasKey) return;

    const activeCount = pages.filter(p => p.status === 'processing').length;
    const pendingPages = pages.filter(p => p.status === 'pending');

    if (pendingPages.length === 0) return;

    // 1. Check Concurrency Limit
    const concurrencySlots = CONCURRENCY_LIMIT - activeCount;
    if (concurrencySlots <= 0) return;

    // 2. Check Rate Limit (RPM)
    const now = Date.now();
    // Filter strictly for the calculation to be safe
    const validHistory = requestHistory.filter(t => now - t < 60000); 
    const rpmSlots = RPM_LIMIT - validHistory.length;
    
    if (rpmSlots <= 0) return;

    // 3. Determine how many to start
    const toStartCount = Math.min(pendingPages.length, concurrencySlots, rpmSlots);

    if (toStartCount > 0) {
      const pagesToStart = pendingPages.slice(0, toStartCount);
      const newTimestamps = Array(toStartCount).fill(now);

      // Record request timestamps
      setRequestHistory(prev => [...prev, ...newTimestamps]);

      // Update status to processing
      setPages(prev => prev.map(p => 
        pagesToStart.find(start => start.id === p.id) 
          ? { ...p, status: 'processing' } 
          : p
      ));

      // Trigger processing
      pagesToStart.forEach(page => {
        processPage(page);
      });
    }
  }, [pages, hasKey, processPage, requestHistory]);

  const completedCount = pages.filter(p => p.status === 'completed').length;
  const totalCount = pages.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
      <ApiKeySelector onKeySelected={() => setHasKey(true)} t={t} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-4">
          {/* UI Language Switcher (Left) */}
          <div className="flex bg-gray-800 rounded-md p-0.5 border border-gray-700">
             <button 
               onClick={() => setUiLanguage('ru')}
               className={`px-2 py-1 text-xs font-bold rounded ${uiLanguage === 'ru' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
             >
               RU
             </button>
             <button 
               onClick={() => setUiLanguage('en')}
               className={`px-2 py-1 text-xs font-bold rounded ${uiLanguage === 'en' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
             >
               EN
             </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center text-black font-bold text-xl">
              M
            </div>
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">{t.title}</h1>
          </div>
        </div>

        {totalCount > 0 && (
           <div className="flex items-center space-x-4 flex-1 max-w-md ml-8">
             <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-yellow-500 h-2.5 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(234,179,8,0.5)]" 
                  style={{ width: `${progress}%` }}
                ></div>
             </div>
             <span className="text-xs text-gray-400 whitespace-nowrap min-w-[60px]">
               {completedCount} / {totalCount}
             </span>
           </div>
        )}
        <div className="ml-4 flex flex-col items-end">
          <span className="px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-400 border border-gray-700">
            Gemini Nano Banana Pro
          </span>
          <span className="text-[10px] text-gray-600 mt-1">
             {t.rateLimit} {RPM_LIMIT}/min
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {pages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-8">
             <div className="text-center mb-8">
               <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4">
                 {t.configTitle}
               </h2>
               <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                 {t.configDesc}
               </p>
             </div>

             {/* Configuration Panel */}
             {!isPreparing && (
               <div className="w-full max-w-2xl bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-8 backdrop-blur-sm">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Mode Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">{t.contentType}</label>
                      <div className="flex bg-gray-900 p-1 rounded-lg">
                        <button
                          onClick={() => handleModeChange('manga')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${
                            appMode === 'manga' 
                              ? 'bg-yellow-500 text-black shadow-lg' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {t.manga}
                        </button>
                        <button
                          onClick={() => handleModeChange('manhwa')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${
                            appMode === 'manhwa' 
                              ? 'bg-yellow-500 text-black shadow-lg' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {t.manhwa}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 h-4">
                        {appMode === 'manga' 
                          ? t.mangaDesc 
                          : t.manhwaDesc}
                      </p>
                    </div>

                    {/* Language Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">{t.targetLang}</label>
                      <div className="flex bg-gray-900 p-1 rounded-lg">
                        <button
                          onClick={() => setTargetLanguage('ru')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${
                            targetLanguage === 'ru' 
                              ? 'bg-red-500 text-white shadow-lg' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          RU 🇷🇺
                        </button>
                        <button
                          onClick={() => setTargetLanguage('en')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${
                            targetLanguage === 'en' 
                              ? 'bg-blue-500 text-white shadow-lg' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          EN 🇺🇸
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 h-4">
                        {t.targetLangDesc}
                      </p>
                    </div>

                    {/* Order Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-3">{t.order}</label>
                      <div className="flex bg-gray-900 p-1 rounded-lg">
                        <button
                          onClick={() => setSortOrder('asc')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${
                            sortOrder === 'asc' 
                              ? 'bg-gray-600 text-white shadow-lg' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {t.orderAsc}
                        </button>
                        <button
                          onClick={() => setSortOrder('desc')}
                          className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${
                            sortOrder === 'desc' 
                              ? 'bg-gray-600 text-white shadow-lg' 
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {t.orderDescBtn}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 h-4">
                        {t.orderDesc}
                      </p>
                    </div>
                  </div>
               </div>
             )}
             
             {isPreparing ? (
               <div className="w-full max-w-2xl mx-auto p-10 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl bg-gray-800/50 h-[300px]">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-500 mb-4"></div>
                  <h3 className="text-xl font-semibold text-white">{t.preparing}</h3>
                  <p className="text-gray-400 mt-2">
                    {appMode === 'manhwa' ? t.preparingManhwa : t.preparingList}
                  </p>
               </div>
             ) : (
               <FileUploader onFilesSelected={handleFilesSelected} t={t} />
             )}

             <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center text-sm text-gray-500">
                <div className="p-4 bg-gray-800/30 rounded-lg">
                   <strong className="block text-gray-300 mb-1">
                     {t.feature1Title}
                   </strong>
                   {appMode === 'manhwa' 
                     ? t.feature1DescManhwa 
                     : t.feature1DescManga}
                </div>
                <div className="p-4 bg-gray-800/30 rounded-lg">
                   <strong className="block text-gray-300 mb-1">{t.feature2Title}</strong>
                   {t.feature2Desc}
                </div>
                <div className="p-4 bg-gray-800/30 rounded-lg">
                   <strong className="block text-gray-300 mb-1">{t.feature3Title}</strong>
                   {t.feature3Desc}
                </div>
             </div>
          </div>
        ) : (
          <div className="w-full h-full bg-black">
            <MangaReader pages={pages} onRegenerate={handleRegenerate} t={t} />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
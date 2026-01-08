import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { MangaPage } from '../types';
import { stitchTranslatedPages } from '../services/geminiService';

interface MangaReaderProps {
  pages: MangaPage[];
  onRegenerate: (pageId: string) => void;
  t: any;
}

const MangaReader: React.FC<MangaReaderProps> = ({ pages, onRegenerate, t }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isStitching, setIsStitching] = useState(false);

  // Check if all pages are completed successfully
  const allCompleted = pages.length > 0 && pages.every(p => p.status === 'completed' && p.translatedUrl);

  const handleDownloadPDF = async () => {
    if (!allCompleted || isExporting) return;
    
    setIsExporting(true);
    
    try {
      // Initialize PDF
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: 'a4', // Initial format, will change per page
        compress: true
      });

      // Remove the default initial page so we can add pages with correct dimensions
      doc.deletePage(1);

      // Process pages sequentially to maintain order
      for (const page of pages) {
        if (!page.translatedUrl) continue;

        // Load image to get dimensions
        const img = new Image();
        img.src = page.translatedUrl;
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;

        // Add page matching image dimensions
        // orientation: 'p' (portrait) or 'l' (landscape) based on aspect ratio
        doc.addPage([imgWidth, imgHeight], imgWidth > imgHeight ? 'l' : 'p');

        // Add image filling the page
        // We use the image format provided by browser (usually it handles base64 fine)
        // If translatedUrl is png base64, 'PNG' works. 
        // Our service returns data:image/png;base64,...
        doc.addImage(page.translatedUrl, 'PNG', 0, 0, imgWidth, imgHeight);
      }

      doc.save('manga-chapter.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("PDF Error. Try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadLongStrip = async () => {
    if (!allCompleted || isStitching) return;
    
    setIsStitching(true);
    try {
        const urls = pages.map(p => p.translatedUrl as string);
        // Expect an array of base64 strings now
        const stitchedBase64Array = await stitchTranslatedPages(urls);
        
        if (!stitchedBase64Array || stitchedBase64Array.length === 0) {
            throw new Error("Failed to generate stitched image");
        }

        // Create download links for each part
        stitchedBase64Array.forEach((base64, index) => {
            const link = document.createElement('a');
            link.href = base64;
            const suffix = stitchedBase64Array.length > 1 ? `_part${index + 1}` : '';
            link.download = `manga-full-chapter${suffix}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

    } catch (error) {
        console.error("Error stitching images:", error);
        alert("Stitching Error.");
    } finally {
        setIsStitching(false);
    }
  };
  
  return (
    <div className="w-full max-w-3xl mx-auto bg-black shadow-2xl min-h-screen flex flex-col items-center pb-20">
      {pages.map((page) => (
        <div key={page.id} className="relative w-full group">
          {page.status === 'completed' && page.translatedUrl ? (
            <>
              {/* Translated Image */}
              <img 
                src={page.translatedUrl} 
                alt={`Page ${page.pageNumber}`} 
                className="w-full h-auto block"
                loading="lazy"
              />
              
              {/* Regenerate Button Overlay (Visible on Hover) */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                <button
                  onClick={() => onRegenerate(page.id)}
                  className="bg-gray-900/80 hover:bg-yellow-500 hover:text-black text-white p-2 rounded-lg backdrop-blur-md shadow-lg border border-gray-700 transition-all transform hover:scale-105 flex items-center gap-2"
                  title="Redo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-xs font-bold px-1">{t.redo}</span>
                </button>
              </div>
            </>
          ) : (
            // Placeholder / Original / Loading State
            <div className="w-full aspect-[2/3] bg-gray-900 flex items-center justify-center border-b border-gray-800 relative overflow-hidden">
               {/* Show original blurred in background if available */}
               <div 
                  className="absolute inset-0 bg-cover bg-center opacity-30 blur-sm"
                  style={{ backgroundImage: `url(${page.originalUrl})` }}
               ></div>
               
               <div className="relative z-10 flex flex-col items-center p-4 text-center">
                  <span className="text-gray-400 font-mono text-sm mb-2">{t.scan} #{page.pageNumber}</span>
                  {page.status === 'processing' ? (
                    <div className="flex flex-col items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500 mb-2"></div>
                      <span className="text-yellow-400 text-sm animate-pulse">{t.translating}</span>
                    </div>
                  ) : page.status === 'error' ? (
                    <div className="flex flex-col items-center">
                      <span className="text-red-500 text-sm mb-2 font-semibold">{t.error}</span>
                      <button
                        onClick={() => onRegenerate(page.id)}
                        className="px-4 py-2 bg-red-500/20 border border-red-500/50 hover:bg-red-500 hover:text-white rounded-md text-red-400 text-xs transition-colors flex items-center gap-2"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {t.retry}
                      </button>
                    </div>
                  ) : (
                     <span className="text-gray-500 text-sm">{t.waiting}</span>
                  )}
               </div>
            </div>
          )}
        </div>
      ))}
      
      <div className="p-10 text-center w-full">
        {allCompleted ? (
          <div className="flex flex-col items-center animate-fade-in-up gap-4">
            <p className="text-green-400 font-semibold">{t.finished}</p>
            <div className="flex gap-4">
                <button
                  onClick={handleDownloadPDF}
                  disabled={isExporting}
                  className={`
                    px-6 py-3 rounded-full font-bold shadow-lg flex items-center space-x-2 transition-all transform hover:scale-105 active:scale-95
                    ${isExporting 
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                      : 'bg-yellow-500 text-black hover:bg-yellow-400'
                    }
                  `}
                >
                  {isExporting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{t.downloadingPdf}</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>{t.downloadPdf}</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadLongStrip}
                  disabled={isStitching}
                  className={`
                    px-6 py-3 rounded-full font-bold shadow-lg flex items-center space-x-2 transition-all transform hover:scale-105 active:scale-95
                    ${isStitching 
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                    }
                  `}
                >
                   {isStitching ? (
                    <>
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{t.stitching}</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      <span>{t.downloadStrip}</span>
                    </>
                  )}
                </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">{t.endOfChapter}</p>
        )}
      </div>
    </div>
  );
};

export default MangaReader;
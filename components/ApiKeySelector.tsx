import React, { useState, useEffect } from 'react';

interface ApiKeySelectorProps {
  onKeySelected: () => void;
  t: any;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected, t }) => {
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);

  const checkKey = async () => {
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
      if (selected) {
        onKeySelected();
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    checkKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success after dialog interaction to avoid race conditions
      setHasKey(true);
      onKeySelected();
    }
  };

  if (loading) return null; // Or a spinner

  if (hasKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <h2 className="text-2xl font-bold mb-4 text-yellow-400">{t.apiKeyRequired}</h2>
        <p className="text-gray-300 mb-6 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.apiKeyDesc }} />
        
        <button
          onClick={handleSelectKey}
          className="w-full py-3 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-bold rounded-lg transition-transform transform hover:scale-105 shadow-lg mb-4"
        >
          {t.selectKey}
        </button>
        
        <div className="text-xs text-gray-500 mt-4">
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-yellow-400 underline"
          >
            {t.billingInfo}
          </a>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySelector;
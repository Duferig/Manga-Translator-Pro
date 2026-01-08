import React, { useRef } from 'react';

interface FileUploaderProps {
  onFilesSelected: (files: FileList) => void;
  t: any;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, t }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
    }
  };

  return (
    <div 
      className="w-full max-w-2xl mx-auto mt-10 p-10 border-2 border-dashed border-gray-600 hover:border-yellow-500 rounded-xl transition-colors bg-gray-800/50 flex flex-col items-center justify-center cursor-pointer group"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        multiple 
        accept="image/webp, image/png, image/jpeg" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleChange}
      />
      <div className="bg-gray-700 p-4 rounded-full mb-4 group-hover:bg-gray-600 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold mb-2 text-white">{t.uploadTitle}</h3>
      <p className="text-gray-400 text-center text-sm whitespace-pre-line">
        {t.uploadDesc}
      </p>
    </div>
  );
};

export default FileUploader;
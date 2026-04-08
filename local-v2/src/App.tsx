import { useEffect, useMemo, useRef, useState } from 'react';
import { detectRegions, translateRegions } from './services/gemini';
import { downloadJson, extractPageNumber, fileToDataUrl, uid } from './lib/file';
import { clearProject, loadProject, saveProject } from './lib/storage';
import type { PageRecord, ProjectData, ProjectSettings, TextRegion } from './types';

const defaultSettings: ProjectSettings = {
  apiKey: '',
  visionModel: 'gemini-3-flash-preview',
  textModel: 'gemini-3-flash-preview',
  targetLanguage: 'Russian',
  sourceLanguageHint: 'Japanese or Korean or English',
  tone: 'Natural manga dialogue with clear character voice'
};

const createEmptyProject = (): ProjectData => ({
  id: uid(),
  name: 'Untitled Chapter',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pages: [],
  glossary: {},
  settings: defaultSettings
});

const App = () => {
  const [project, setProject] = useState<ProjectData>(createEmptyProject);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading local project...');
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    loadProject()
      .then((stored) => {
        if (stored) {
          setProject(stored);
          setSelectedPageId(stored.pages[0]?.id ?? null);
          setStatus('Loaded from IndexedDB.');
        } else {
          setStatus('Fresh local workspace.');
        }
      })
      .catch(() => setStatus('Fresh local workspace.'));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveProject(project)
        .then(() => setStatus('Saved locally.'))
        .catch(() => setStatus('Save failed.'));
    }, 500);

    return () => window.clearTimeout(timer);
  }, [project]);

  const patchProject = (updater: (current: ProjectData) => ProjectData) => {
    setProject((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  };

  const sortedPages = useMemo(
    () => [...project.pages].sort((a, b) => a.pageNumber - b.pageNumber || a.name.localeCompare(b.name)),
    [project.pages]
  );

  const selectedPage = sortedPages.find((page) => page.id === selectedPageId) ?? sortedPages[0] ?? null;

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;

    setStatus('Preparing pages...');
    const list = Array.from(files).sort((a, b) => extractPageNumber(a.name) - extractPageNumber(b.name));
    const newPages: PageRecord[] = [];

    for (const file of list) {
      newPages.push({
        id: uid(),
        name: file.name,
        pageNumber: extractPageNumber(file.name),
        imageDataUrl: await fileToDataUrl(file),
        regions: [],
        summary: '',
        detectionStatus: 'idle',
        translationStatus: 'idle'
      });
    }

    patchProject((current) => ({ ...current, pages: [...current.pages, ...newPages] }));
    setSelectedPageId(newPages[0]?.id ?? null);
    setStatus('Pages added.');
  };

  const updatePage = (pageId: string, updater: (page: PageRecord) => PageRecord) => {
    patchProject((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === pageId ? updater(page) : page))
    }));
  };

  const handleDetect = async () => {
    if (!selectedPage) return;

    const snapshot = projectRef.current;
    setStatus(`Detecting regions in ${selectedPage.name}...`);
    updatePage(selectedPage.id, (page) => ({ ...page, detectionStatus: 'loading' }));

    try {
      const regions = await detectRegions(selectedPage, snapshot.settings);
      updatePage(selectedPage.id, (page) => ({ ...page, regions, detectionStatus: 'done' }));
      setStatus('Detection complete.');
    } catch (error) {
      updatePage(selectedPage.id, (page) => ({
        ...page,
        detectionStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Detection failed.'
      }));
      setStatus('Detection failed.');
    }
  };

  const handleTranslate = async () => {
    if (!selectedPage) return;

    const snapshot = projectRef.current;
    const pageIndex = sortedPages.findIndex((item) => item.id === selectedPage.id);
    const recentSummaries = sortedPages
      .slice(Math.max(0, pageIndex - 3), pageIndex)
      .map((item) => item.summary)
      .filter(Boolean);

    setStatus(`Translating ${selectedPage.name}...`);
    updatePage(selectedPage.id, (page) => ({ ...page, translationStatus: 'loading' }));

    try {
      const response = await translateRegions(
        selectedPage,
        snapshot.name,
        snapshot.glossary,
        recentSummaries,
        snapshot.settings
      );

      patchProject((current) => ({
        ...current,
        glossary: { ...current.glossary, ...(response.glossaryUpdates ?? {}) },
        pages: current.pages.map((page) => {
          if (page.id !== selectedPage.id) return page;

          return {
            ...page,
            summary: response.pageSummary ?? page.summary,
            translationStatus: 'done',
            regions: page.regions.map((region) => {
              const translated = response.translations?.find((entry) => entry.regionId === region.id);
              return translated ? { ...region, translatedText: translated.translatedText } : region;
            })
          };
        })
      }));

      setStatus('Translation complete.');
    } catch (error) {
      updatePage(selectedPage.id, (page) => ({
        ...page,
        translationStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Translation failed.'
      }));
      setStatus('Translation failed.');
    }
  };

  const addRegion = () => {
    if (!selectedPage) return;

    const region: TextRegion = {
      id: uid(),
      bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.12 },
      sourceText: '',
      translatedText: '',
      kind: 'speech',
      notes: '',
      confidence: 0.25
    };

    updatePage(selectedPage.id, (page) => ({ ...page, regions: [...page.regions, region] }));
  };

  const updateRegion = (
    regionId: string,
    key: 'kind' | 'notes' | 'sourceText' | 'translatedText',
    value: string
  ) => {
    if (!selectedPage) return;

    updatePage(selectedPage.id, (page) => ({
      ...page,
      regions: page.regions.map((region) =>
        region.id === regionId ? ({ ...region, [key]: value } as TextRegion) : region
      )
    }));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="card stack">
          <div className="row split">
            <h1>Manga Translator Pro</h1>
            <span className="badge">Local v2</span>
          </div>

          <input
            value={project.name}
            onChange={(e) => patchProject((c) => ({ ...c, name: e.target.value }))}
            placeholder="Project name"
          />

          <input
            type="password"
            value={project.settings.apiKey}
            onChange={(e) =>
              patchProject((c) => ({ ...c, settings: { ...c.settings, apiKey: e.target.value } }))
            }
            placeholder="Gemini API key"
          />

          <div className="grid two">
            <input
              value={project.settings.visionModel}
              onChange={(e) =>
                patchProject((c) => ({ ...c, settings: { ...c.settings, visionModel: e.target.value } }))
              }
              placeholder="Vision model"
            />
            <input
              value={project.settings.textModel}
              onChange={(e) =>
                patchProject((c) => ({ ...c, settings: { ...c.settings, textModel: e.target.value } }))
              }
              placeholder="Text model"
            />
          </div>

          <label className="button primary">
            <input
              type="file"
              multiple
              hidden
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleUpload(e.target.files)}
            />
            Upload pages
          </label>

          <div className="grid two">
            <button className="button" onClick={() => downloadJson('manga-translator-local-v2-project.json', project)}>
              Export JSON
            </button>
            <button
              className="button danger"
              onClick={() => void clearProject().then(() => setProject(createEmptyProject()))}
            >
              Reset
            </button>
          </div>

          <p className="helper">{status}</p>
        </div>

        <div className="card stack">
          <div className="row split">
            <h2>Pages</h2>
            <span className="badge">{sortedPages.length}</span>
          </div>

          {sortedPages.map((page) => (
            <button
              key={page.id}
              className={`page-item ${selectedPage?.id === page.id ? 'selected' : ''}`}
              onClick={() => setSelectedPageId(page.id)}
            >
              <div>
                <strong>{page.name}</strong>
                <div className="helper">Page #{page.pageNumber || '—'}</div>
              </div>
              <div className="page-meta">
                <span className="mini-badge">{page.detectionStatus}</span>
                <span className="mini-badge">{page.translationStatus}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-panel">
        {!selectedPage ? (
          <div className="empty-state">
            <h2>No page selected</h2>
            <p>Upload files to start.</p>
          </div>
        ) : (
          <>
            <div className="card stack">
              <div className="row split wrap">
                <div>
                  <h2>{selectedPage.name}</h2>
                  <p className="helper">
                    Detection: {selectedPage.detectionStatus} · Translation: {selectedPage.translationStatus}
                  </p>
                </div>
                <div className="row wrap">
                  <button className="button" onClick={() => void handleDetect()}>
                    Detect regions
                  </button>
                  <button className="button primary" onClick={() => void handleTranslate()}>
                    Translate page
                  </button>
                  <button className="button" onClick={addRegion}>
                    Add region
                  </button>
                </div>
              </div>

              <div className="preview-frame">
                <img src={selectedPage.imageDataUrl} alt={selectedPage.name} />
                {selectedPage.regions.map((region) => (
                  <div
                    key={region.id}
                    className={`region-box kind-${region.kind}`}
                    style={{
                      left: `${region.bbox.x * 100}%`,
                      top: `${region.bbox.y * 100}%`,
                      width: `${region.bbox.w * 100}%`,
                      height: `${region.bbox.h * 100}%`
                    }}
                  >
                    <span>{region.translatedText || region.sourceText || region.kind}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card stack">
              <div className="row split">
                <h2>Regions</h2>
                <span className="badge">{selectedPage.regions.length}</span>
              </div>

              {selectedPage.regions.map((region) => (
                <div key={region.id} className="region-editor">
                  <div className="grid two">
                    <input
                      value={region.kind}
                      onChange={(e) => updateRegion(region.id, 'kind', e.target.value)}
                      placeholder="kind"
                    />
                    <input
                      value={region.notes ?? ''}
                      onChange={(e) => updateRegion(region.id, 'notes', e.target.value)}
                      placeholder="notes"
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={region.sourceText}
                    onChange={(e) => updateRegion(region.id, 'sourceText', e.target.value)}
                    placeholder="source text"
                  />
                  <textarea
                    rows={3}
                    value={region.translatedText}
                    onChange={(e) => updateRegion(region.id, 'translatedText', e.target.value)}
                    placeholder="translated text"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;

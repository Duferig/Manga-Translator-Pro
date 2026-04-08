import type { ProjectData } from '../types';

const DB_NAME = 'manga-translator-pro-local-v2';
const STORE_NAME = 'projects';
const PROJECT_KEY = 'active-project';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
  });

export const saveProject = async (project: ProjectData): Promise<void> => {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(project, PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save project.'));
  });

  db.close();
};

export const loadProject = async (): Promise<ProjectData | null> => {
  const db = await openDb();

  const value = await new Promise<ProjectData | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(PROJECT_KEY);
    request.onsuccess = () => resolve((request.result as ProjectData | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load project.'));
  });

  db.close();
  return value;
};

export const clearProject = async (): Promise<void> => {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear project.'));
  });

  db.close();
};

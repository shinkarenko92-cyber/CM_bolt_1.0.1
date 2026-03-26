import type { CleaningPhotoType } from '@/types/cleaning';
import { uploadPhoto } from '@/services/cleaning';

const DB_NAME = 'roomi-photo-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending-photos';

interface QueuedPhoto {
  id?: number;
  taskId: string;
  type: CleaningPhotoType;
  fileName: string;
  fileType: string;
  blob: Blob;
  createdAt: number;
  retries: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueuePhoto(
  taskId: string,
  file: File,
  type: CleaningPhotoType,
): Promise<void> {
  const db = await openDB();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.add({
    taskId,
    type,
    fileName: file.name,
    fileType: file.type,
    blob,
    createdAt: Date.now(),
    retries: 0,
  } satisfies Omit<QueuedPhoto, 'id'>);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPending(): Promise<QueuedPhoto[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as QueuedPhoto[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function incrementRetries(id: number, retries: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(id);
  req.onsuccess = () => {
    const item = req.result as QueuedPhoto | undefined;
    if (item) {
      item.retries = retries;
      store.put(item);
    }
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const MAX_RETRIES = 5;

export async function flushQueue(): Promise<number> {
  const items = await getAllPending();
  let uploaded = 0;

  for (const item of items) {
    if (item.retries >= MAX_RETRIES) {
      if (item.id != null) await removeFromQueue(item.id);
      continue;
    }
    try {
      const file = new File([item.blob], item.fileName, { type: item.fileType });
      await uploadPhoto(item.taskId, file, item.type);
      if (item.id != null) await removeFromQueue(item.id);
      uploaded++;
    } catch {
      if (item.id != null) await incrementRetries(item.id, item.retries + 1);
    }
  }
  return uploaded;
}

export async function getPendingCount(): Promise<number> {
  const items = await getAllPending();
  return items.length;
}

let listening = false;

export function startQueueListener(): void {
  if (listening) return;
  listening = true;

  window.addEventListener('online', () => {
    flushQueue().catch((e) => { if (import.meta.env.DEV) console.error('[photoQueue] flush error:', e); });
  });

  if (navigator.onLine) {
    flushQueue().catch((e) => { if (import.meta.env.DEV) console.error('[photoQueue] flush error:', e); });
  }
}

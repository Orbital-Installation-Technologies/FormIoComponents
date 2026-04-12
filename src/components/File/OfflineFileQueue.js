/**
 * OfflineFileQueue
 *
 * Manages pending file uploads inside the Formio draft JSON.
 * No new database, no new table, no server changes.
 *
 * Queue location inside draft data:
 *   data.__pendingUploads[componentKey] = [{ id, name, type, size, dataUrl, ... }]
 *
 * The `__` prefix means Formio ignores this key during submission validation.
 */

export const QUEUE_KEY = '__pendingUploads';

// ── private helpers ───────────────────────────────────────────

function makePendingId() {
  return `pq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fileToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToFile(dataUrl, name, type) {
  const [header, base64] = dataUrl.split(',');
  const mime  = type || header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bytes = atob(base64);
  const buf   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new File([buf], name, { type: mime });
}

// ── public API ────────────────────────────────────────────────

export class OfflineFileQueue {

  /**
   * Persist a failed file into the queue stored in draftData.
   * Reads the compressed blob as base64 and stores everything needed
   * to reconstruct the upload later.
   *
   * @param {object}     draftData    – live form data object (mutated in-place)
   * @param {string}     componentKey – form field key, e.g. "avatar"
   * @param {object}     fileToSync   – fileToSync object from Formio upload
   * @param {Blob|File}  compressedBlob – the processed blob (after compression)
   * @returns {Promise<string>} the stable pending-entry ID
   */
  static async enqueue(draftData, componentKey, fileToSync, compressedBlob) {
    if (!draftData[QUEUE_KEY])               draftData[QUEUE_KEY] = {};
    if (!draftData[QUEUE_KEY][componentKey]) draftData[QUEUE_KEY][componentKey] = [];

    // Store the COMPRESSED blob so retry uses the same quality
    const dataUrl = await fileToDataUrl(compressedBlob);

    const entry = {
      id:           makePendingId(),
      name:         fileToSync.name,
      originalName: fileToSync.originalName || fileToSync.name,
      type:         compressedBlob.type || fileToSync.file?.type || 'image/jpeg',
      size:         compressedBlob.size,
      storage:      fileToSync.storage || 's3',
      dataUrl,                        // ← compressed bytes as base64
      addedAt:      Date.now(),
      retryCount:   0,
    };

    draftData[QUEUE_KEY][componentKey].push(entry);
    return entry.id;
  }

  /**
   * Remove a successfully-uploaded entry from the queue.
   */
  static dequeue(draftData, componentKey, entryId) {
    const list = draftData?.[QUEUE_KEY]?.[componentKey];
    if (!list) return;
    const idx = list.findIndex(e => e.id === entryId);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) delete draftData[QUEUE_KEY][componentKey];
    if (Object.keys(draftData[QUEUE_KEY] || {}).length === 0) delete draftData[QUEUE_KEY];
  }

  /** All pending entries for one component key. */
  static getPending(draftData, componentKey) {
    return draftData?.[QUEUE_KEY]?.[componentKey] || [];
  }

  /** All pending entries anywhere under draft data (nested forms, grids, etc.). */
  static getAllPending(draftData) {
    const acc = [];
    const seen = new WeakSet();
    function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (seen.has(obj)) return;
      seen.add(obj);
      const q = obj[QUEUE_KEY];
      if (q && typeof q === 'object' && !Array.isArray(q)) {
        Object.entries(q).forEach(([componentKey, entries]) => {
          if (Array.isArray(entries)) {
            entries.forEach(entry => acc.push({ componentKey, entry }));
          }
        });
      }
      for (const v of Object.values(obj)) {
        if (!v || typeof v !== 'object') continue;
        if (Array.isArray(v)) v.forEach(item => walk(item));
        else walk(v);
      }
    }
    walk(draftData);
    return acc;
  }

  /** Reconstruct a real File from a queue entry. */
  static reconstructFile(entry) {
    return dataUrlToFile(entry.dataUrl, entry.name, entry.type);
  }

  /**
   * Build the stub object that should live in component.dataValue.
   * It looks like a real uploaded file so the form renders a preview,
   * but carries __pendingId so we can identify it later.
   *
   * NOTE: blob: URLs die on page reload, so we also store __dataUrl
   * for re-hydration.
   */
  static toStub(entry) {
    // Reconstruct a fresh blob: URL (the old one expired after reload)
    let url = entry.url;
    try {
      const file = OfflineFileQueue.reconstructFile(entry);
      url = URL.createObjectURL(file);
    } catch (_) { /* keep stored url as fallback */ }

    return {
      name:         entry.name,
      originalName: entry.originalName,
      size:         entry.size,
      type:         entry.type,
      storage:      entry.storage,
      url,
      __pendingId:  entry.id,
      __dataUrl:    entry.dataUrl,   // kept so we never lose the bytes
    };
  }

  /** Increment retry counter (mutates entry in draftData in-place). */
  static incrementRetry(draftData, componentKey, entryId) {
    const entry = (draftData?.[QUEUE_KEY]?.[componentKey] || []).find(e => e.id === entryId);
    if (entry) entry.retryCount = (entry.retryCount || 0) + 1;
  }

  /** True when the draft still has at least one pending entry. */
  static hasPending(draftData) {
    return OfflineFileQueue.getAllPending(draftData).length > 0;
  }
}

import { Components } from "@formio/js";
import CustomFileEditForm from "./CustomFile.form";
import { OfflineFileQueue, QUEUE_KEY } from './OfflineFileQueue';

const FileComponent = Components.components.file;

export default class CustomFile extends FileComponent {
  static editForm(...extend) {
    return CustomFileEditForm(...extend);
  }

  static schema(...extend) {
    return FileComponent.schema(...extend);
  }

  constructor(...args) {
    super(...args);
    this.picaInstance      = null;
    this._workerCanvas     = null;
    this._uiUpdateTimeout  = null;
    this._previewTimer     = null;
    this._badgeTimer       = null;
    this._draftDataRef     = null;
  }

  /**
   * On slow/weak connections mobile browsers may report file.type = "" when the
   * file is selected before the OS has fully read it (common with camera capture).
   * The base validateFileSettings() immediately rejects empty-type files that have
   * a filePattern set (e.g. "image/*"), showing a false "wrong type" error even
   * though the image will upload fine once the type resolves.
   *
   * Fix: if the file has no MIME type but its extension looks like an image,
   * skip the pattern check and only run the size constraints.
   */
  validateFileSettings(file) {
    const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff?)$/i;
    if (!file.type && file.name && this.component.filePattern && IMAGE_EXTENSIONS.test(file.name)) {
      if (this.component.fileMinSize && !this.validateMinSize(file, this.component.fileMinSize)) {
        return {
          status: 'error',
          message: this.t('File is too small; it must be at least {{ size }}', { size: this.component.fileMinSize }),
        };
      }
      if (this.component.fileMaxSize && !this.validateMaxSize(file, this.component.fileMaxSize)) {
        return {
          status: 'error',
          message: this.t('File is too big; it must be at most {{ size }}', { size: this.component.fileMaxSize }),
        };
      }
      return {};
    }
    return super.validateFileSettings(file);
  }

  _getLiveDraftData() {
    if (this.root?.data) return this.root.data;
    if (this._draftDataRef) return this._draftDataRef;
    return {};
  }

  async syncQueue() {
    return this.retryPendingUploads();
  }

  /**
   * This is the key: fileToSync is an object containing:
   *  - file: the actual File object
   *  - name: file name
   *  - storage: 's3' | 'base64'
   *  - url: preview
   */
  async uploadFile(fileToSync) {
    if (!fileToSync?.file) return super.uploadFile(fileToSync);

    const file = fileToSync.file;
    let processedBlob = file;

    if (file.type.startsWith('image/')) {
      try {
        const img = await this.fileToImage(file);
        processedBlob = await this.compressImage(img, file);
      } catch (err) {
        console.warn('[CustomFile] Compression failed, using original:', err);
      }
    }

    const ext          = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
    const highResTime  = typeof performance !== 'undefined'
      ? performance.now().toString(36).replace('.', '') : Date.now().toString(36);
    const fixedSeed    = file.size ? file.size.toString(36) : highResTime;
    const uniqueId     = Math.random().toString(36).slice(2, 10);
    const currentCount = Array.isArray(this.dataValue) ? this.dataValue.length : 0;
    const scrambledName = `file-${fixedSeed}-${uniqueId}-${currentCount}-${highResTime}${ext}`;

    const scrambledFile = new File([processedBlob], scrambledName, { type: processedBlob.type });
    fileToSync.file         = scrambledFile;
    fileToSync.name         = scrambledName;
    fileToSync.originalName = scrambledName;
    fileToSync.url          = URL.createObjectURL(processedBlob);

    setTimeout(() => this.resetFileInputs(), 0);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return await this._queueOffline(fileToSync, processedBlob);
    }

    try {
      const result = await super.uploadFile(fileToSync);
      this.checkComponentValidity(this.data, true);
      this.updateImagePreviews();
      return result;
    } catch (err) {
      if (this._isNetworkError(err)) {
        this._spliceFromArrays(scrambledName, null);
        return await this._queueOffline(fileToSync, processedBlob);
      }
      throw err;
    }
  }

  async _queueOffline(fileToSync, compressedBlob) {
    const draftData    = this._getLiveDraftData();
    const componentKey = this.key;

    const entryId = await OfflineFileQueue.enqueue(
      draftData, componentKey, fileToSync, compressedBlob
    );

    const stub = {
      name:         fileToSync.name,
      originalName: fileToSync.originalName,
      size:         compressedBlob.size,
      type:         compressedBlob.type,
      storage:      fileToSync.storage || 's3',
      url:          fileToSync.url,
      __pendingId:  entryId,
    };

    if (!Array.isArray(this.dataValue)) this.dataValue = [];
    if (!this.dataValue.some(f => f.__pendingId === entryId)) this.dataValue.push(stub);
    if (Array.isArray(this.files) && !this.files.some(f => f.__pendingId === entryId)) this.files.push(stub);

    this._syncQueueMeta(draftData);
    this._renderPendingBadges();
    this.redraw();
    this._notifyDraftChanged();

    return stub;
  }

  // Reset file input elements to prevent mobile browsers from reusing cached files
  resetFileInputs() {
    if (typeof document === 'undefined' || !this.element) return;
    window.requestAnimationFrame?.(() => {
      this.element?.querySelectorAll('input[type="file"]')
        .forEach(input => { try { input.value = ''; } catch (_) {} });
    });
  }

  // New method to ensure image previews are displayed
 updateImagePreviews() {
    if (typeof document === 'undefined' || !this.element) return;
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => {
      const rootEl = this.element;
      const imgs   = rootEl.querySelectorAll('img[ref="fileImage"], .file img, img.wrapped');
      const files  = Array.isArray(this.dataValue)
        ? this.dataValue : (this.dataValue ? [this.dataValue] : []);
      if (!imgs.length || !files.length) return;
      imgs.forEach((img, i) => {
        const fname = img.alt || img.getAttribute('data-file-name');
        const fd    = files.find(f =>
          f.name === fname || f.originalName === fname ||
          (f.name && fname && f.name.includes(fname))
        ) || files[i];
        if (fd?.url && img.src !== fd.url) {
          img.src = fd.url;
          Object.assign(img.style, {
            display: 'inline-block', opacity: '1',
            width: '80px', height: '80px', objectFit: 'cover',
            cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px',
          });
          img.onclick = e => { e.preventDefault(); e.stopPropagation(); this.openImageModal(fd.url); };
        }
      });
      this._renderPendingBadges();
    }, 300);
  }
_syncQueueMeta(draftData) {
    if (this._draftDataRef && this._draftDataRef !== draftData) {
      this._draftDataRef[QUEUE_KEY] = draftData[QUEUE_KEY];
    }
  }
_spliceFromArrays(name, pendingId) {
    const shouldRemove = f => {
      if (pendingId && f.__pendingId === pendingId) return true;
      if (name && f.name === name) return true;
      return false;
    };
    if (Array.isArray(this.dataValue)) {
      for (let i = this.dataValue.length - 1; i >= 0; i--) {
        if (shouldRemove(this.dataValue[i])) this.dataValue.splice(i, 1);
      }
    }
    if (Array.isArray(this.files)) {
      for (let i = this.files.length - 1; i >= 0; i--) {
        if (shouldRemove(this.files[i])) this.files.splice(i, 1);
      }
    }
  }

  _ensureStubPresent(entry) {
    if (!Array.isArray(this.dataValue)) this.dataValue = [];
    if (!this.dataValue.some(f => f.__pendingId === entry.id)) {
      const stub = OfflineFileQueue.toStub(entry);
      this.dataValue.push(stub);
      if (Array.isArray(this.files) && !this.files.some(f => f.__pendingId === entry.id)) {
        this.files.push(stub);
      }
      this.redraw();
    }
  }

  _isNetworkError(err) {
    if (!err) return false;
    if (err instanceof TypeError) return true;
    if (err.status === 0 || err.statusCode === 0) return true;
    if (err.message && /network|failed to fetch|load failed|net::/i.test(err.message)) return true;
    return false;
  }

  _renderPendingBadges() {
    if (typeof document === 'undefined' || !this.element) return;
    clearTimeout(this._badgeTimer);
    this._badgeTimer = setTimeout(() => {
      if (!this.element) return;
      const containers = this.element.querySelectorAll('div.file, .file');
      const files      = Array.isArray(this.dataValue) ? this.dataValue : [];
      containers.forEach((container, idx) => {
        container.querySelector('.pending-badge')?.remove();
        if (files[idx]?.__pendingId) {
          const badge         = document.createElement('div');
          badge.className     = 'pending-badge';
          badge.title         = 'Waiting for network';
          badge.style.cssText = 'position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;z-index:20;pointer-events:none';
          badge.textContent        = 'PENDING';
          container.style.position = 'relative';
          container.appendChild(badge);
        }
      });
    }, 200);
  }

  _notifyDraftChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('akiti:draftChanged', {
      detail: { data: this._getLiveDraftData() },
    }));
  }

  async retryPendingUploads() {
    const draftData    = this._getLiveDraftData();
    const componentKey = this.key;
    const pending      = OfflineFileQueue.getPending(draftData, componentKey);
    if (pending.length === 0) return;

    console.info(`[CustomFile] Retrying ${pending.length} pending upload(s) for "${componentKey}"`);

    for (const entry of [...pending]) {
      try {
        const file = OfflineFileQueue.reconstructFile(entry);

        this._spliceFromArrays(entry.name, entry.id);

        // Must match Form.io File.upload() / syncFiles(): same shape as prepareFileToUpload + merge fileInfo into dataValue.
        const fileToSync = Object.assign(this.getInitFileToSync(file), {
          name:         entry.name,
          originalName: entry.originalName || entry.name,
          url:          URL.createObjectURL(file),
          storage:      entry.storage || this.component.storage,
          file,
          size:         file.size,
        });

        const fileInfo = await super.uploadFile(fileToSync);
        if (fileInfo) {
          fileInfo.originalName = fileToSync.originalName;
          if (fileToSync.hash) fileInfo.hash = fileToSync.hash;
        }

        // Use setValue + redraw: mutating dataValue with .push() skips Form.io hooks, and setValue alone
        // may not redraw the file list when ref/input counts match (Component#setValue).
        const updatedList = [...(this.dataValue || [])];
        updatedList.push(fileInfo);
        this.setValue(updatedList, { modified: true });
        this.emit?.('fileUploadingEnd');
        this.redraw();

        OfflineFileQueue.dequeue(this._getLiveDraftData(), componentKey, entry.id);
        this._syncQueueMeta(this._getLiveDraftData());
        console.info(`[CustomFile] Retry succeeded: ${entry.name}`);

        this.updateImagePreviews?.();

      } catch (retryErr) {
        console.warn(`[CustomFile] Retry failed for ${entry.name}:`, retryErr.message);
        OfflineFileQueue.incrementRetry(this._getLiveDraftData(), componentKey, entry.id);
        this._ensureStubPresent(entry);
      }
    }

    this._renderPendingBadges();
    this.triggerUpdate();
    this._notifyDraftChanged();
    this.checkComponentValidity(this.data, true);
  }

  triggerUpdate() {
    if (this._uiUpdateTimeout) window.cancelAnimationFrame(this._uiUpdateTimeout);
    this._uiUpdateTimeout = window.requestAnimationFrame(() => {
      this.wrapDefaultImages(); this.updateImagePreviews();
    });
  }
  restorePendingPreviews(draftData) {
    const componentKey  = this.key;
    const liveData      = this._getLiveDraftData();
    const effectiveData = liveData[QUEUE_KEY] ? liveData
      : (draftData?.[QUEUE_KEY] ? draftData : liveData);

    const pending = OfflineFileQueue.getPending(effectiveData, componentKey);
    if (pending.length === 0) return;

    if (!Array.isArray(this.dataValue)) this.dataValue = [];
    if (!Array.isArray(this.files))     this.files     = [];

    for (const entry of pending) {
      const stub = OfflineFileQueue.toStub(entry);
      if (!this.dataValue.some(f => f.__pendingId === entry.id)) this.dataValue.push(stub);
      if (!this.files.some(f => f.__pendingId === entry.id))     this.files.push(stub);
    }

    this._renderPendingBadges();
    this.redraw();
  }
  fileToImage(file) {
    return new Promise((resolve, reject) => {
      // createObjectURL is faster than readAsDataURL — no base64 encoding overhead
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  }

  async loadPica() {
    if (typeof window === "undefined") return null; // SSR: do nothing server-side

    // Return cached instance if available
    if (this.picaInstance) return this.picaInstance;

    try {
      // Dynamic import for better mobile compatibility
      const picaModule = await import("pica");
      const Pica = picaModule.default || picaModule;

      // Initialize Pica with mobile-friendly options
      this.picaInstance = Pica({
        tile: 1024, // Smaller tiles for mobile memory constraints
        features: ['js', 'wasm'], // Use both JS and WASM if available
        createCanvas: (width, height) => {
          // Check canvas size limits (iOS Safari has ~5MP limit)
          const maxDimension = 4096;
          if (width > maxDimension || height > maxDimension) {
            console.warn(`Canvas size ${width}x${height} exceeds mobile limit, capping at ${maxDimension}`);
            width = Math.min(width, maxDimension);
            height = Math.min(height, maxDimension);
          }
          return document.createElement("canvas");
        }
      });

      return this.picaInstance;
    } catch (err) {
      console.error("Failed to load Pica:", err);
      return null;
    }
  }

  async compressImage(image, originalFile = null) {
    try {
      const p = await this.loadPica();
      if (!p) {
        throw new Error("Pica not available");
      }

      // Original dimensions
      const srcW = image.width;
      const srcH = image.height;

      // Determine smallest dimension
      const smallest = Math.min(srcW, srcH);

      // Mobile-friendly: use smaller max size (1200px instead of 1500px)
      const maxDimension = 1200;

      // If the image is already small enough, avoid canvas re-encoding
      if (smallest <= maxDimension) {
        // Already a JPEG at the right size — return as-is to avoid a lossy re-encode cycle
        if (originalFile && originalFile.type === 'image/jpeg') {
          return originalFile;
        }
        // Non-JPEG (PNG, HEIC, WebP…) — convert to JPEG via canvas
        if (typeof document === 'undefined') {
          throw new Error("Document is not available");
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(srcW, 4096);
        canvas.height = Math.min(srcH, 4096);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await p.toBlob(canvas, "image/jpeg", 0.82);
      }

      // Compute scale factor
      const scale = maxDimension / smallest;
      // Compute new dimensions
      let newW = Math.round(srcW * scale);
      let newH = Math.round(srcH * scale);

      // Ensure dimensions don't exceed mobile canvas limits
      const maxCanvasDimension = 4096;
      if (newW > maxCanvasDimension || newH > maxCanvasDimension) {
        const scaleDown = Math.min(maxCanvasDimension / newW, maxCanvasDimension / newH);
        newW = Math.round(newW * scaleDown);
        newH = Math.round(newH * scaleDown);
      }

      // Prepare canvas
      if (typeof document === 'undefined') {
        throw new Error("Document is not available");
      }
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = Math.min(srcW, maxCanvasDimension);
      srcCanvas.height = Math.min(srcH, maxCanvasDimension);
      const srcCtx = srcCanvas.getContext("2d");
      srcCtx.drawImage(image, 0, 0, srcCanvas.width, srcCanvas.height);

      const destCanvas = document.createElement("canvas");
      destCanvas.width = newW;
      destCanvas.height = newH;

      // Resize with Pica
      await p.resize(srcCanvas, destCanvas, {
        quality: 2, // Good quality, mobile-friendly
        unsharpAmount: 80,
        unsharpThreshold: 2
      });

      const compressedBlob = await p.toBlob(destCanvas, "image/jpeg", 0.82);
      return compressedBlob;
    } catch (err) {
      console.error("Error in compressImage:", err);
      throw err; // Re-throw to be caught by uploadFile
    }
  }

  loadImageCssOnce = () => {
    if (typeof document === 'undefined') return; // SSR: skip in server environment
    if (document.getElementById("custom-file-css")) return; // already added

    const style = document.createElement("style");
    style.id = "custom-file-css";

    style.innerHTML = `
    /* Container for each uploaded file */
  /* Add this inside your style.innerHTML in loadImageCssOnce */
  .file-modal-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: zoom-out;
}

.file-modal-content {
  max-width: 90%;
  max-height: 90%;
  border-radius: 4px;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
  cursor: default;
}

/* Make the thumbnail look clickable */
div.file img {
  cursor: zoom-in !important;
  transition: transform 0.2s;
}

div.file img:hover {
  transform: scale(1.05);
}
  .custom-file-modal-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: rgba(0, 0, 0, 0.9) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 99999 !important; /* Extremely high */
  cursor: zoom-out !important;
}

.custom-file-modal-content {
  max-width: 90% !important;
  max-height: 90% !important;
  object-fit: contain !important;
  border: 2px solid white !important;
}
.custom-file-modal-close {
  position: absolute !important;
  top: 20px !important;
  right: 30px !important;
  color: #fff !important;
  font-size: 30px !important; /* Slightly smaller font makes centering easier */
  font-weight: bold !important;
  cursor: pointer !important;
  z-index: 20001 !important;
  
  /* The Centering Magic */
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 0 !important; /* Prevents text-line padding */
  padding-bottom: 4px !important; /* Adjusts for the 'X' character's baseline offset */
  
  background: rgba(0,0,0,0.5) !important;
  width: 50px !important;
  height: 50px !important;
  border-radius: 50% !important;
  transition: 0.3s !important;
}

.custom-file-modal-close:hover {
  color: #ff4d4f !important;
  background: rgba(255,255,255,0.2) !important;
}

/* Adjust content for mobile to ensure close button is accessible */
@media (max-width: 600px) {
  .custom-file-modal-close {
    top: 10px !important;
    right: 10px !important;
    width: 40px !important;
    height: 40px !important;
    font-size: 30px !important;
  }
}
    div.file, .file {
      display: inline-block !important;
      position: relative !important;
      margin: 5px !important;
    }
  
    /* Image preview - ensure visibility on mobile */
    div.file img, .file img,
    [ref="fileImage"], img[ref="fileImage"] {
      width: 80px !important;
      height: 80px !important;
      min-width: 80px !important;
      min-height: 80px !important;
      object-fit: cover !important;
      border-radius: 8px !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
      display: block !important;
      opacity: 1 !important;
    }
  
    /* Delete button */
    div.file .file-delete, .file .file-delete {
      position: absolute !important;
      top: -10px !important;
      right: -10px !important;
      background-color: #ff4d4f !important;
      color: white !important;
      border-radius: 50% !important;
      width: 20px !important;
      height: 20px !important;
      font-size: 14px !important;
      font-weight: bold !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
      user-select: none !important;
      z-index: 10 !important;
    }
  
    div.file .file-delete:hover, .file .file-delete:hover {
      background-color: #ff7875 !important;
    }
    `;
    document.head.appendChild(style);
  };

  wrapDefaultImagesOnce = false;
  wrapDefaultImages() {
    if (typeof document === 'undefined' || !this.element) return;
    const rootEl = this.element;

    const imageSelectors = [
      'img[ref="fileImage"]:not(.wrapped)',
      '.file-image img:not(.wrapped)',
      'img[src*="blob:"]:not(.wrapped)'
    ];

    imageSelectors.forEach(selector => {
      rootEl.querySelectorAll(selector).forEach(defaultImg => {
        const parent = defaultImg.parentElement;
        if (!parent || parent.classList.contains("file")) return;

        // Mark it so we don't wrap it twice
        defaultImg.classList.add('wrapped');

        const oldDeleteBtn = parent.querySelector('i[ref="removeLink"]');
        if (oldDeleteBtn) oldDeleteBtn.style.display = "none";

        const container = document.createElement("div");
        container.className = "file";
        parent.insertBefore(container, defaultImg);
        container.appendChild(defaultImg);

        const delBtn = document.createElement("span");
        delBtn.className = "file-delete";
        delBtn.innerText = "✕";
        delBtn.removeLink = oldDeleteBtn;
        container.appendChild(delBtn);

        delBtn.onclick = () => {
          if (delBtn.removeLink) delBtn.removeLink.click();
          container.remove();
        };
      });
    });
  }
  openImageModal(src) {
    if (typeof document === 'undefined' || !document.body) return;

    const overlay = document.createElement('div');
    overlay.className = 'custom-file-modal-overlay';

    // Close Button
    const closeBtn = document.createElement('span');
    closeBtn.className = 'custom-file-modal-close';
    closeBtn.innerHTML = '&times;';

    const img = document.createElement('img');
    img.src = src;
    img.className = 'custom-file-modal-content';
 img.onclick = (e) => e.stopPropagation();
    overlay.appendChild(closeBtn);
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.onclick = closeModal;
    closeBtn.onclick = closeModal;
  }
  setValue(value, flags = {}) {
    const normalizedValue = value ? (Array.isArray(value) ? value : [value]) : [];
    const changed = super.setValue(normalizedValue, flags);

    // Sync internal files property so validation sees the correct state
    if (this.files !== undefined) {
      this.files = normalizedValue;
    }

    //  If this is a draft/submission, we need to ensure the files
    // are marked as 'scrambled' immediately so validation doesn't trip.
    if (flags.fromSubmission || flags.init) {
      normalizedValue.forEach(f => {
        if (f && !f.__scrambledName) {
          f.__scrambledName = f.name; // Use existing name as the stable key
        }
      });
    }

    //  Debounced UI Update
    if (this.element && !flags.noUpdateConfig) {
      clearTimeout(this.uiTimer);
      this.uiTimer = setTimeout(() => {
        this.wrapDefaultImages();
        this.updateImagePreviews();
      }, 200);
    }

    return changed;
  }

  attach(element) {
    const res = super.attach(element);
    if (typeof document === 'undefined' || !this.element) return res;

    this.loadImageCssOnce();
    this.wrapDefaultImagesOnce = false;
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => {
        if (!this.element) return;

        this.wrapDefaultImages(); // Wrap existing and new images
        this.updateImagePreviews(); // Ensure they have the right SRC

        this.element.removeEventListener('click', this.onImageClick);
        this.onImageClick = (e) => {
          // Updated selector to be more aggressive
          const img = e.target.closest('img[ref="fileImage"], .file img, img.wrapped, [ref="fileImage"]');
          if (img && img.src) {
            e.preventDefault();
            e.stopPropagation();
            this.openImageModal(img.src);
          }
        };
        this.element.addEventListener('click', this.onImageClick);
      });
    }

    this.setupFileInputResetListeners();
    return res;
  }
  // Set up listeners to reset file inputs after file selection (for mobile camera)
  setupFileInputResetListeners() {
    if (typeof document === 'undefined') return; // SSR: skip in server environment
    const rootEl = this.element;
    if (!rootEl) return;

    // Use a MutationObserver to catch dynamically added file inputs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Check if the added node is a file input or contains one
            const fileInputs = node.matches && node.matches('input[type="file"]')
              ? [node]
              : node.querySelectorAll ? node.querySelectorAll('input[type="file"]') : [];

            fileInputs.forEach(input => {
              this.attachFileInputResetListener(input);
            });
          }
        });
      });
    });

    // Observe the component element for added file inputs
    observer.observe(rootEl, { childList: true, subtree: true });

    // Also attach to existing file inputs
    const existingInputs = rootEl.querySelectorAll ? rootEl.querySelectorAll('input[type="file"]') : [];
    existingInputs.forEach(input => {
      this.attachFileInputResetListener(input);
    });

    // Store observer for cleanup if needed
    this._fileInputObserver = observer;
  }

  // Attach reset listener to a specific file input
  attachFileInputResetListener(input) {
    if (typeof document === 'undefined') return; // SSR: skip in server environment
    if (!input || input.hasAttribute('data-reset-listener-attached')) {
      return;
    }

    input.setAttribute('data-reset-listener-attached', 'true');

    // Store reference to component instance
    const component = this;
    const inputRef = input;

    // Listen for change event - reset the input immediately after Form.io reads it
    // Critical for mobile camera which caches file references
    input.addEventListener('change', function handleFileChange(e) {
      // Reset after Form.io has had a chance to read the file
      // Use multiple strategies to ensure reset happens
      const resetInput = () => {
        if (!inputRef || !inputRef.parentNode) return;

        try {
          // Strategy 1: Try to replace the input completely (most reliable for mobile)
          const parent = inputRef.parentNode;
          const nextSibling = inputRef.nextSibling;

          // Create a brand new input element
          if (typeof document === 'undefined') return; // SSR guard
          const newInput = document.createElement('input');
          newInput.type = 'file';
          newInput.value = '';

          // Copy all relevant attributes
          const attrsToCopy = ['accept', 'capture', 'multiple', 'name', 'id', 'class', 'style', 'disabled', 'required'];
          attrsToCopy.forEach(attr => {
            const value = inputRef.getAttribute(attr);
            if (value !== null) {
              newInput.setAttribute(attr, value);
            }
          });

          // Copy all data attributes
          Array.from(inputRef.attributes).forEach(attr => {
            if (attr.name.startsWith('data-') && attr.name !== 'data-reset-listener-attached') {
              newInput.setAttribute(attr.name, attr.value);
            }
          });

          // Replace the input
          if (nextSibling) {
            parent.insertBefore(newInput, nextSibling);
          } else {
            parent.appendChild(newInput);
          }
          parent.removeChild(inputRef);

          // Re-attach listener to new input
          if (component && component.attachFileInputResetListener) {
            component.attachFileInputResetListener(newInput);
          }
        } catch (replaceErr) {
          // Strategy 2: Fallback - just reset the value
          try {
            if (inputRef) {
              inputRef.value = '';
              // Force a blur to ensure mobile browsers process the reset
              inputRef.blur();
              if (typeof setTimeout !== 'undefined') {
                setTimeout(() => {
                  if (inputRef) inputRef.focus();
                  if (typeof setTimeout !== 'undefined') {
                    setTimeout(() => {
                      if (inputRef) inputRef.blur();
                    }, 10);
                  }
                }, 10);
              }
            }
          } catch (resetErr) {
            console.warn('Could not reset file input:', resetErr);
          }
        }
      };

      // Reset after a short delay to ensure Form.io has read the file
      // But do it quickly enough that the next camera capture gets a fresh input
      if (typeof setTimeout !== 'undefined') {
        setTimeout(resetInput, 50);
      }
    }, { once: false });
  }
   checkComponentValidity(data, dirty, row, options) {
    if (!this.visible || this.disabled) return true;
    if (!(this.component.validate?.required)) return super.checkComponentValidity(data, dirty, row, options);
    const has = (Array.isArray(this.dataValue) && this.dataValue.length > 0)
             || (this.files?.length > 0)
             || (!!this.dataValue && !Array.isArray(this.dataValue));
    if (has) {
      this.error = ''; this.invalid = false; this.setPristine(true);
      this._errors = []; this._visibleErrors = [];
      this.setCustomValidity?.('', false);
      if (this.element) {
        this.element.classList.remove('has-error', 'error');
        const em = this.element.querySelector('.formio-errors, .help-block');
        if (em) { em.style.display = 'none'; em.innerHTML = ''; }
      }
      return true;
    }
    return super.checkComponentValidity(data, dirty, row, options);
  }
 getValue() {
    const v = super.getValue();
    if ((!v || (Array.isArray(v) && !v.length)) && this.files?.length) return this.files;
    return v;
  }
 detach() {
    window.cancelAnimationFrame?.(this._uiUpdateTimeout);
    clearTimeout(this._previewTimer);
    clearTimeout(this._badgeTimer);
    this._fileInputObserver?.disconnect();
    this._fileInputObserver = null;
    this.picaInstance       = null;
    this._workerCanvas      = null;
    return super.detach();
  }

}

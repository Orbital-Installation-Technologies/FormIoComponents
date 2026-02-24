import { Components } from "@formio/js";
import CustomFileEditForm from "./CustomFile.form";

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
    this.picaInstance = null;
    this._observerActive = false; // Improvement: Flag to prevent redundant observer attachments
    // IMPROVEMENT: Initialize persistent canvas references to avoid repeated allocations and Garbage Collection (GC) churn
    this._workerCanvas = null; 

    // IMPROVEMENT: Initialize timer references to ensure they can be cleared properly during component lifecycle
    this._uiUpdateTimeout = null;
    this._previewTimer = null;
  } 

  /**
   * This is the key: fileToSync is an object containing:
   *  - file: the actual File object
   *  - name: file name
   *  - storage: 's3' | 'base64'
   *  - url: preview
   */
    async uploadFile(fileToSync) {
    if (!fileToSync?.file) {
      return super.uploadFile(fileToSync);
    }

    const file = fileToSync.file;
    let processedBlob = file;
 
    if (file.type.startsWith("image/")) {
      try {
        const img = await this.fileToImage(file);
        processedBlob = await this.compressImage(img);

        // IMPROVEMENT: Immediate cleanup of the temporary Image object to free RAM/CPU
        img.src = "";
      } catch (err) {
        console.error("Compression failed, using original", err);
      }
    }

    // --- COLLISION-PROOF SCRAMBLING ---
    const ext = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';

    // 1. Fixed Seed: Use size + high-res timestamp (sub-millisecond)
    const highResTime = typeof performance !== 'undefined' ? performance.now().toString(36).replace('.', '') : '';
    const fixedSeed = file.size ? file.size.toString(36) : highResTime;

    // 2. Unique ID: Standard random string
    const uniqueId = Math.random().toString(36).slice(2, 10);

    // 3. Instance Index: Use the current length of files to prevent same-batch collisions
    const currentFiles = Array.isArray(this.dataValue) ? this.dataValue.length : 0;

    const scrambledName = `file-${fixedSeed}-${uniqueId}-${currentFiles}-${highResTime}${ext}`;

    const scrambledFile = new File(
      [processedBlob],
      scrambledName,
      { type: processedBlob.type }
    );

    // CRITICAL: We must also update 'originalName' so Form.io doesn't
    // try to validate against the browser's original filename.
    fileToSync.file = scrambledFile;
    fileToSync.name = scrambledName;
    fileToSync.originalName = scrambledName;
    fileToSync.url = URL.createObjectURL(processedBlob);

    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => this.resetFileInputs(), 0);
    }

    // --- PREVENT VALIDATION ERROR ---
    // Ensure the internal state doesn't already think this name exists
    if (this.component.multiple && Array.isArray(this.dataValue)) {
      this.dataValue = this.dataValue.filter(f => f.name !== scrambledName);
    }

    const uploadedData = await super.uploadFile(fileToSync);
    this.updateImagePreviews();
    this.triggerUpdate();
    return uploadedData;
  }
  removeFile(index) {
    super.removeFile(index);
    this.triggerUpdate();
  }
  // Reset file input elements to prevent mobile browsers from reusing cached files
  resetFileInputs() {
    if (typeof document === 'undefined') return; // SSR: skip in server environment
    const rootEl = this.element;
    if (!rootEl) return;

    // Find all file input elements within this component
    const fileInputs = rootEl.querySelectorAll('input[type="file"]');

    fileInputs.forEach(input => {
      // Reset the input value to allow selecting a new file
      // This is crucial for mobile camera capture which can cache the file reference
      // Setting value to empty string forces the browser to treat the next selection as new
      try {
        input.value = '';
        // Some mobile browsers need the input to be "touched" to clear the cache
        // Triggering a blur event can help ensure the reset is processed
        input.blur();
      } catch (e) {
        // Some browsers may throw an error when setting value directly
        // In that case, we'll try cloning the input as a fallback
        try {
          const form = input.form;
          const parent = input.parentNode;
          if (parent) {
            const newInput = input.cloneNode(true);
            newInput.value = '';
            parent.replaceChild(newInput, input);
          }
        } catch (cloneError) {
          console.warn('Could not reset file input:', cloneError);
        }
      }
    });
  }

  // New method to ensure image previews are displayed
  updateImagePreviews() {
    if (typeof document === 'undefined' || !this.element) return;

    if (this._previewTimer) {
      clearTimeout(this._previewTimer);
    }
    
    // IMPROVEMENT: Use RequestAnimationFrame to ensure UI updates happen in sync with the screen refresh rate
    window.requestAnimationFrame(() => {
      const rootEl = this.element;
      // Unified selector to find all possible image containers
      const imageElements = rootEl.querySelectorAll(
        'img[ref="fileImage"]:not(.is-processed), .file img:not(.is-processed), img.wrapped:not(.is-processed)'
      );
      // NORMALIZE: Ensure we are always dealing with an array, even for single file components/drafts
      const fileValue = Array.isArray(this.dataValue)
        ? this.dataValue
        : (this.dataValue ? [this.dataValue] : []);

      if (imageElements.length === 0 || fileValue.length === 0) return;

      imageElements.forEach((img, index) => {
        // Get the identifier from the image (Form.io usually puts the name in 'alt')
        const fileName = img.alt || img.getAttribute('data-file-name');

        // FIND LOGIC:
        // 1. Match by exact name or originalName
        // 2. Match by partial string (useful for scrambled names)
        // 3. Fallback to index (most reliable for drafts where names haven't synced yet)
        const fileData = fileValue.find(f =>
          f.name === fileName ||
          f.originalName === fileName ||
          (f.name && fileName && f.name.includes(fileName))
        ) || fileValue[index];
        // IMPROVEMENT: Only update SRC if it has changed to prevent redundant GPU paint tasks
        if (img.getAttribute('data-loaded-url') === fileData.url) return;

        if (fileData && fileData.url) {
          // Prevent infinite loops: Only update if the SRC is actually different
          if (img.src !== fileData.url) {
            img.src = fileData.url;
            img.setAttribute('data-loaded-url', fileData.url);
            img.classList.add('custom-thumbnail-processed');
            img.classList.add('is-processed');
            

            // Attach Modal Click
            img.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.openImageModal(fileData.url);
            };
          }
        }
      });
    })
  }

  fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
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
        tile: 512, // Smaller tiles for mobile memory constraints
        features: ['js', 'wasm'], // Use both JS and WASM if available
        idle: true, // IMPROVEMENT: Pica will only run when the browser is idle to save CPU/Battery   
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

  async compressImage(image) {
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
      const maxDimension = 1000;

      // If the image is already small enough, return original size as Blob
      if (smallest <= maxDimension) {
        // Convert original image to Blob without resizing
        if (typeof document === 'undefined') {
          throw new Error("Document is not available");
        }
        const canvas = document.createElement("canvas");
        // Ensure canvas doesn't exceed mobile limits
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
      // IMPROVEMENT: Use a single persistent offscreen canvas if possible to avoid GC pressure
      if (!this._workerCanvas) {
        this._workerCanvas = document.createElement("canvas");
      }
      const destCanvas = this._workerCanvas;
      destCanvas.width = newW;
      destCanvas.height = newH;

      // Resize with Pica
      await p.resize(srcCanvas, destCanvas, {
        quality: 2, // Good quality, mobile-friendly
        unsharpAmount: 80,
        unsharpThreshold: 2,
        alpha: false // IMPROVEMENT: Disable alpha channel to save memory
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
  .custom-thumbnail-processed {
      display: inline-block !important;
      opacity: 1 !important;
      width: 80px !important;
      height: 80px !important;
      object-fit: cover !important;
      cursor: pointer !important;
      border: 1px solid #ccc !important;
      border-radius: 4px !important;
    }
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
  removeFile(index) {
    // Ensure dataValue is an array so findIndex doesn't crash
    if (this.dataValue && !Array.isArray(this.dataValue)) {
      this.dataValue = [this.dataValue];
    }

    // Call the original Form.io removal logic
    super.removeFile(index);

    // Optional: Trigger a UI refresh to clean up your custom wrappers
    this.updateImagePreviews();
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

    // Prevent clicking the image from closing the modal
    img.onclick = (e) => e.stopPropagation();

    overlay.appendChild(closeBtn);
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.onclick = closeModal;
    closeBtn.onclick = closeModal;
  }

  setValue(value, flags = {}) {
    // Normalize to array for consistent handling
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
    if (!flags.noUpdateConfig) {
      this.triggerUpdate();
    }

    return changed;
  }

  attach(element) {
    const res = super.attach(element);
    if (typeof document === 'undefined' || !this.element) return res;

    this.loadImageCssOnce();

    // REMOVE the flag here so it re-scans for new images on every attach
    // this.wrapDefaultImagesOnce = false;

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => {
        if (!this.element) return;

        this.wrapDefaultImages(); // Wrap existing and new images
        this.updateImagePreviews(); // Ensure they have the right SRC

      });
    }
    element.addEventListener('click', (e) => {
      // Only react to clicks on images that we have successfully processed
      const img = e.target.closest('.is-processed'); 
      if (img && img.src) {
        this.openImageModal(img.src);
      }
    });
    element.addEventListener('change', (event) => {
      if (event.target.type === 'file') {
        this.handleFileChange(event.target);
      }
    });
    this.triggerUpdate();
    return res;
  }
 
  handleFileChange(e) {
    // IMPROVEMENT: Directly identify the target input from the event object.
    // This is more battery-efficient than searching the DOM for it again.
    const inputRef = e.target;
  
    // Reset after Form.io has had a chance to read the file
    const resetInput = () => {
      // IMPROVEMENT: Ensure the component still exists in the DOM before running heavy tasks.
      // If the user navigated away, we stop execution immediately to save battery.
      if (!inputRef || !inputRef.parentNode || !this.element) return;
  
      try {
        // Strategy 1: Replace the input completely
        const parent = inputRef.parentNode;
        const nextSibling = inputRef.nextSibling;
  
        if (typeof document === 'undefined') return; 
        
        // IMPROVEMENT: Use shallow cloneNode(true) instead of manual attribute looping.
        // Manually iterating over dozens of attributes like 'accept' or 'data-*' 
        // wastes CPU cycles. Native cloning is handled by the browser's optimized engine.
        const newInput = inputRef.cloneNode(true);
        newInput.value = '';
  
        // Replace the input
        if (nextSibling) {
          parent.insertBefore(newInput, nextSibling);
        } else {
          parent.appendChild(newInput);
        }
        parent.removeChild(inputRef);
  
        // Re-attach listener if your logic requires it
        if (this.attachFileInputResetListener) {
          this.attachFileInputResetListener(newInput);
        }
      } catch (replaceErr) {
        // Strategy 2: Fallback - just reset the value
        try {
          if (inputRef) {
            // IMPROVEMENT: Clearing the value string is the most battery-efficient way
            // to release the OS-level file handle and camera cache.
            inputRef.value = '';
  
            // IMPROVEMENT: We use a single .blur() instead of nested focus/blur timeouts.
            // Frequent timer wake-ups prevent the mobile CPU from entering a 
            // low-power sleep state. A single blur signals the OS that the 
            // interaction is complete.
            inputRef.blur();
          }
        } catch (resetErr) {
          console.warn('Could not reset file input:', resetErr);
        }
      }
    };
  
    // Reset after a short delay
    // IMPROVEMENT: 50ms is a safe buffer that allows the event loop to finish 
    // without keeping the CPU active longer than necessary.
    if (typeof setTimeout !== 'undefined') {
      setTimeout(resetInput, 50);
    }
  }
  triggerUpdate() {
    if (this._uiUpdateTimeout) window.cancelAnimationFrame(this._uiUpdateTimeout);
    this._uiUpdateTimeout = window.requestAnimationFrame(() => {
      this.wrapDefaultImages();
      this.updateImagePreviews();
    });
  }
  detach() {
    // IMPROVEMENT: Rigorous cleanup of all timers and references to prevent background battery drain
    if (this._uiUpdateTimeout) clearTimeout(this._uiUpdateTimeout);
    if (this._previewTimer) clearTimeout(this._previewTimer);
    // Disconnect the MutationObserver if it exists
    if (this._fileInputObserver) {
      this._fileInputObserver.disconnect();
      this._fileInputObserver = null;
      this._observerActive = false;
    }
    // IMPROVEMENT: Clear the Pica instance and canvas to free heavy WebAssembly/GPU memory
    this.picaInstance = null;
    if (this._workerCanvas) {
        this._workerCanvas.width = 0;
        this._workerCanvas.height = 0;
        this._workerCanvas = null;
    }
    return super.detach();
  }

}

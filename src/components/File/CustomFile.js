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
    let compressedBlob = file;
    if (file.type.startsWith("image/")) {
      try {
        const img = await this.fileToImage(file);
        compressedBlob = await this.compressImage(img);

        // Add timestamp to filename to ensure each camera capture is unique
        // This prevents mobile browsers from reusing the same file reference
        const timestamp = Date.now();
        const originalName = file.name.replace(/\.(png|jpg|jpeg)$/i, '');
        const compressedFileName = `${originalName}-${timestamp}-compressed.jpg`;
        
        const compressedFile = new File(
          [compressedBlob],
          compressedFileName,
          { type: "image/jpeg" }
        );

        // Create preview URL from compressed blob for immediate display
        const previewUrl = URL.createObjectURL(compressedBlob);

        // Update the file object with preview URL BEFORE upload
        fileToSync.file = compressedFile;
        fileToSync.name = compressedFile.name;
        fileToSync.url = previewUrl; // Set preview URL for immediate display

      } catch (err) {
        console.error("Error compressing image:", err);
        // Fallback: create preview from original file if compression fails
        if (file.type.startsWith("image/")) {
          fileToSync.url = URL.createObjectURL(file);
        }
      }
    } else {
      // For non-image files, create preview URL if not already set
      if (!fileToSync.url && file) {
        fileToSync.url = URL.createObjectURL(file);
      }
    }
    
    // Reset file input immediately after capturing file data (before upload)
    // This prevents mobile browsers from reusing the cached file reference
    // We do this early to ensure the input is cleared before the next camera capture
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => this.resetFileInputs(), 0);
    }
    
    // Call Form.io upload logic
    const uploadedData = await super.uploadFile(fileToSync);
    
    // Update image previews after upload completes
    this.updateImagePreviews();
    
    return uploadedData;
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

  // CLEAR any existing pending updates to stop the "snowball" effect
  if (this._previewTimer) {
    clearTimeout(this._previewTimer);
  }

  // Schedule a SINGLE update
  this._previewTimer = setTimeout(() => {
    const rootEl = this.element;
    if (!rootEl) return;

    // Use a unified selector
    const imageElements = rootEl.querySelectorAll('img[ref="fileImage"], .file img, img.wrapped');
    
    if (imageElements.length === 0) return;

    const fileValue = this.dataValue || [];

    imageElements.forEach(img => {
      const fileName = img.alt || img.getAttribute('data-file-name');
      const fileData = Array.isArray(fileValue) 
        ? fileValue.find(f => f.name === fileName || f.originalName === fileName)
        : null;

      // Only update if we have a URL and it's DIFFERENT from current src
      // This check is CRITICAL to prevent infinite loops
      if (fileData && fileData.url && img.src !== fileData.url) {
        img.src = fileData.url;
        
        // Apply styles once
        Object.assign(img.style, {
          display: 'block',
          opacity: '1',
          width: '80px',
          height: '80px',
          objectFit: 'cover'
        });
      }
    });
  }, 200); 
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
      const maxDimension = 1200;
      
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
    if (typeof document === 'undefined') return; // SSR: skip in server environment
    if (this.wrapDefaultImagesOnce) return;  // already applied
    this.wrapDefaultImagesOnce = true;
    const rootEl = this.element;
    if (!rootEl) return;

    // Use a more robust selector that works on mobile
    const imageSelectors = [
      '[ref="fileImage"]',
      'img[ref="fileImage"]',
      '.file-image img',
      '.file-preview img',
      'img[src*="blob:"]',
      'img[src*="data:image"]'
    ];

    let foundImages = [];
    imageSelectors.forEach(selector => {
      rootEl.querySelectorAll(selector).forEach(img => {
        if (!foundImages.includes(img)) {
          foundImages.push(img);
        }
      });
    });

    // Also get file value to set image src
    const fileValue = this.dataValue;
    const fileUrls = {};
    if (fileValue && Array.isArray(fileValue)) {
      fileValue.forEach(file => {
        if (file.url) {
          fileUrls[file.name] = file.url;
        }
      });
    }

    foundImages.forEach(defaultImg => {
      const parent = defaultImg.parentElement;
      if (!parent) return;

      // Hide the original Form.io delete button
      const oldDeleteBtn = parent.querySelector('i[ref="removeLink"]');
      if (oldDeleteBtn) oldDeleteBtn.style.display = "none";

      // Avoid double wrapping
      if (parent.classList.contains("file")) return;

      // Set image src if we have a URL for it
      const currentHref = typeof window !== 'undefined' ? window.location.href : '';
      if (!defaultImg.src || defaultImg.src === '' || defaultImg.src === currentHref) {
        const fileName = defaultImg.alt || defaultImg.getAttribute('data-file-name') || '';
        if (fileUrls[fileName]) {
          defaultImg.src = fileUrls[fileName];
        } else if (fileValue && fileValue.length > 0 && fileValue[0].url) {
          defaultImg.src = fileValue[0].url;
        }
      }

      // Ensure image is visible on mobile
      defaultImg.style.display = "block";
      defaultImg.style.maxWidth = "100%";
      defaultImg.style.height = "auto";
      defaultImg.style.opacity = "1";

      // Build wrapper
      if (typeof document === 'undefined') return; // SSR: skip in server environment
      const container = document.createElement("div");
      container.className = "file";

      parent.insertBefore(container, defaultImg);
      container.appendChild(defaultImg);

      // Custom delete button
      if (typeof document === 'undefined') return; // SSR: skip in server environment
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
  }

 setValue(value, flags = {}) {
    //  Standard Form.io update
    const changed = super.setValue(value, flags);
  
    //  If this is a draft/submission, we need to ensure the files 
    // are marked as 'scrambled' immediately so validation doesn't trip.
    if (flags.fromSubmission || flags.init) {
      if (Array.isArray(value)) {
        value.forEach(f => {
          if (f && !f.__scrambledName) {
            f.__scrambledName = f.name; // Use existing name as the stable key
          }
        });
      }
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
    if (typeof document === 'undefined') return res; // SSR: skip DOM operations
    this.loadImageCssOnce();
    this.wrapDefaultImagesOnce = false;
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      requestAnimationFrame(() => this.wrapDefaultImages());
    }
    
    // Set up file input reset listeners for mobile camera capture
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
    const existingInputs = rootEl.querySelectorAll('input[type="file"]');
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

  detach() {
    // Disconnect the MutationObserver if it exists
    if (this._fileInputObserver) {
      this._fileInputObserver.disconnect();
      this._fileInputObserver = null;
    }
    return super.detach();
  }  

}

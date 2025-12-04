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
    console.log("CustomFile component instantiated!");
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

    if (file.type.startsWith("image/")) {
      try {
        const img = await this.fileToImage(file);
        const compressedBlob = await this.compressImage(img);

        const compressedFile = new File(
          [compressedBlob],
          file.name.replace(/\.(png|jpg|jpeg)$/i, "-compressed.jpg"),
          { type: "image/jpeg" }
        );

        // Update the file object
        fileToSync.file = compressedFile;
        fileToSync.name = compressedFile.name;

        // Update preview
        this.updatePreview(compressedBlob);
      } catch (err) {
        console.error("Error compressing image:", err);
      }
    }

    // Call Form.io upload logic
    const uploadedData = await super.uploadFile(fileToSync);

    return uploadedData;
  }

  fileToImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async loadPica() {
    if (typeof window === "undefined") return null; // SSR: do nothing server-side
    if (window.pica) return window.pica; // already loaded

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/pica@8.0.0/dist/pica.min.js";
      script.async = true;
      script.onload = () => {
        if (window.pica) resolve(window.pica);
        else reject(new Error("Pica loaded but window.pica is undefined"));
      };
      script.onerror = () => reject(new Error("Failed to load Pica script"));
      document.head.appendChild(script);
    });
  }

  async compressImage(image) {
    const picaLib = await this.loadPica();
    if (!picaLib) throw new Error("Pica not available !");
    const p = picaLib();
    // Original dimensions
    const srcW = image.width;
    const srcH = image.height;

    // Determine smallest dimension
    const smallest = Math.min(srcW, srcH);

    // If the image is already small enough, return original size as Blob
    if (smallest <= 1500) {
      // Convert original image to Blob without resizing
      const canvas = document.createElement("canvas");
      canvas.width = srcW;
      canvas.height = srcH;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return await p.toBlob(canvas, "image/jpeg", 0.82);
    }
    // Compute scale factor
    const scale = 1500 / smallest;
    // Compute new dimensions
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);

    // Prepare canvas
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    srcCanvas.getContext("2d").drawImage(image, 0, 0);

    const destCanvas = document.createElement("canvas");
    destCanvas.width = newW;
    destCanvas.height = newH;

    // Resize with Pica
    await p.resize(srcCanvas, destCanvas);
    const compressedBlob = await p.toBlob(destCanvas, "image/jpeg", 0.82);
    return compressedBlob;
  }

   loadImageCssOnce = () => {
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
  
    /* Image preview */
    div.file img, .file img {
      width: 80px !important;
      height: 80px !important;
      object-fit: cover !important;
      border-radius: 8px !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
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
    if (this.wrapDefaultImagesOnce) return;  // already applied
    this.wrapDefaultImagesOnce = true;
    const rootEl = this.element;
    if (!rootEl) return;

    rootEl.querySelectorAll('[ref="fileImage"]').forEach(defaultImg => {
      const parent = defaultImg.parentElement;
      if (!parent) return;

      // Hide the original Form.io delete button
      const oldDeleteBtn = parent.querySelector('i[ref="removeLink"]');
      if (oldDeleteBtn) oldDeleteBtn.style.display = "none";

      // Avoid double wrapping
      if (parent.classList.contains("file")) return;

      // Build wrapper
      const container = document.createElement("div");
      container.className = "file";

      parent.insertBefore(container, defaultImg);
      container.appendChild(defaultImg);

      // Custom delete button
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

  setValue(value, flags) {
    const result = super.setValue(value, flags);
    // Reset so wrapper runs again only ONE TIME
    this.wrapDefaultImagesOnce = false;

    // Run only after DOM settles (single cycle only)
    requestAnimationFrame(() => this.wrapDefaultImages());

    return result;
  }

  attach(element) {
    const res = super.attach(element);
    this.loadImageCssOnce();
    this.wrapDefaultImagesOnce = false;
    requestAnimationFrame(() => this.wrapDefaultImages());
    return res;
  }
}

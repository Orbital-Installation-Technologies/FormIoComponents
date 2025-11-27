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

  updatePreview(blob) {
    const reader = new FileReader();
    reader.onload = () => {
      const rootEl = this.getElement();
      if (!rootEl) return;
      let imgEl = rootEl.querySelector("img");
      if (!imgEl) {
        imgEl = document.createElement("img");
        rootEl.appendChild(imgEl);
      }
      imgEl.src = reader.result;
    };
    reader.readAsDataURL(blob);
  }
}

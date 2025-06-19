import { Components } from "@formio/js";
import Quagga from "quagga";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import BarcodeScannerEditForm from "./BarcodeScanner.form";
import React from "react";
import { FaCamera, FaFileImage } from "react-icons/fa";
import { renderToStaticMarkup } from "react-dom/server";

const FieldComponent = Components.components.field;

export default class BarcodeScanner extends FieldComponent {
  static editForm = BarcodeScannerEditForm;

  static schema(...extend) {
    return FieldComponent.schema(
      {
        type: "barcode",
        label: "Barcode",
        key: "",
      },
      ...extend,
    );
  }

  static get builderInfo() {
    return {
      title: "Barcode Scanner",
      icon: "barcode",
      group: "basic",
      documentation: "/userguide/#textfield",
      weight: 0,
      schema: BarcodeScanner.schema(),
    };
  }

  constructor(component, options, data) {
    super(component, options, data);
    this._firstOpen = true;
    this.errorMessage = "";
    this._lastBoxes = null;
    this._lastCodes = []; // Changed from _lastCode to _lastCodes array
    this._videoDims = null;
    this._smoothedBoxes = null;
    this._lostCounts = null;
    this._boxColors = {}; // Store colors by box ID
    this._nextBoxId = 1; // Counter for generating unique box IDs
    this._SMOOTH_ALPHA = 0.075; // lower alpha = smoother, less responsive
    this._MAX_LOST_FRAMES = 10; // number of frames to keep a polygon after detection lost
    this._onOverlayClick = this._onOverlayClick.bind(this);
    this._zxingReader = null;
    this._isVideoFrozen = false; // Track if video is frozen
    window.Quagga = Quagga;
  }

  init() {
    super.init();
  }

  conditionallyHidden(data) {
    if (!this.component.customConditional) return false;

    try {
      return !this.evaluate(
        this.component.customConditional,

        {
          ...this.data,
          ...data,
        },
        this.data,
      );
    } catch (e) {
      console.warn("Conditional logic error:", e);
      return false;
    }
  }

  get inputInfo() {
    const info = super.inputInfo;
    return info;
  }
  render(content) {
    const cameraSVG = renderToStaticMarkup(React.createElement(FaCamera)).replace(
      "<svg",
      '<svg style="fill:white;"',
    );

    const fileImageSVG = renderToStaticMarkup(React.createElement(FaFileImage)).replace(
      "<svg",
      '<svg style="fill:white;"',
    );

    return super.render(`
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <input
            ref="barcode"
            type="text"
            class="form-control"
            value="${this.dataValue || ""}"
            style="flex-grow:1; margin-right:10px;"
          />
          <button ref="scanButton" type="button" class="btn btn-primary" style="margin-right:5px;">
            ${cameraSVG}
          </button>
          <button ref="fileButton" type="button" class="btn btn-primary">
            ${fileImageSVG}
          </button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" style="display:none;" />
        ${
          this.errorMessage
            ? `<div class="formio-errors">
                 <div class="form-text error">${this.errorMessage}</div>
               </div>`
            : ""
        }
        <!-- Full-screen dark backdrop -->
        <div
          ref="quaggaModal"
          style="
            display:none;
            position:fixed;
            top:0; left:0;
            width:100%; height:100%;
            background:rgba(0,0,0,0.8);
            z-index:9999;
            align-items:center;
            justify-content:center;
          ">
          <div
            style="
              position: relative;
              max-width: 90vw;
              max-height: 80vh;
              width: auto;
              height: auto;
              background-color: #333;
              border-radius: 8px;
              box-shadow: 0 0 10px rgba(0,0,0,0.5);
              overflow: hidden;
              display: inline-block;
            ">
            <!-- Close button -->
            <button
              ref="closeModal"
              style="
                position: absolute;
                top: 8px;
                right: 8px;
                z-index: 20;
                background: white;
                border: none;
                border-radius: 4px;
                padding: 5px 10px;
              ">
              Close
            </button>

            <!-- Container for Quagga’s <video> + overlay <canvas> -->
            <div
              ref="quaggaContainer"
              style="
                width: 100%;
                height: 100%;
                position: relative;
                background: black;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
              ">
              <!-- Overlay canvas for drawing boxes -->
              <canvas
                ref="quaggaOverlay"
                width="640"
                height="480"
                style="
                  position:absolute;
                  top:0; left:0;
                  width:100%;
                  height:100%;
                  cursor:pointer;
                  z-index:10;
                ">
              </canvas>
            </div>
          </div>
          
          <!-- Freeze/capture button - moved outside the container for better positioning -->
          <button
            ref="freezeButton"
            style="
              position: absolute;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%);
              z-index: 9999;
              background: rgba(255,255,255,0.8);
              border: none;
              border-radius: 50%;
              width: 60px;
              height: 60px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            ">
            <i class="fa fa-camera" style="font-size: 24px;"></i>
          </button>
        </div>
      </div>
    `);
  }

  attach(element) {
    const attached = super.attach(element);

    this.loadRefs(element, {
      barcode: "single",
      scanButton: "single",
      fileButton: "single",
      fileInput: "single",
      quaggaModal: "single",
      quaggaContainer: "single",
      quaggaOverlay: "single",
      closeModal: "single",
      freezeButton: "single",
    });

    if (
      !this.refs.barcode ||
      !this.refs.scanButton ||
      !this.refs.fileButton ||
      !this.refs.fileInput ||
      !this.refs.quaggaModal ||
      !this.refs.quaggaContainer ||
      !this.refs.quaggaOverlay ||
      !this.refs.closeModal ||
      !this.refs.freezeButton
    ) {
      console.warn("Refs not ready—skipping event bindings.");
      return attached;
    }

    if (this.dataValue) {
      this.refs.barcode.value = this.dataValue;
    }

    if (!this.component.disabled) {
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
      });

      this.refs.scanButton.addEventListener("click", () => {
        this.openQuaggaModal();
      });

      this.refs.fileButton.addEventListener("click", () => {
        this.refs.fileInput.click();
      });

      this.refs.fileInput.addEventListener("change", (event) => {
        if (event.target.files && event.target.files[0]) {
          this.processImageFile(event.target.files[0]);
        }
      });

      this.refs.closeModal.addEventListener("click", () => {
        this.stopQuagga();
        this.refs.quaggaModal.style.display = "none";
        this._clearOverlay();
        this._lastBoxes = null;
        this._lastCodes = []; // Reset to empty array
        this._videoDims = null;
        this._isVideoFrozen = false;
        this.refs.quaggaOverlay.removeEventListener("click", this._onOverlayClick);

        // Clear the container when closing
        if (this.refs.quaggaContainer) {
          this.refs.quaggaContainer.innerHTML = "";
        }
      });

      // Add freeze button event listener
      this.refs.freezeButton.addEventListener("click", () => {
        this._toggleFreezeVideo();
      });
    }

    return attached;
  }

  processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.scanImageForBarcodes(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Initialize ZXing reader
  _initZXingReader() {
    if (!this._zxingReader) {
      const hints = new Map();
      const formats = [
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODABAR,
        BarcodeFormat.ITF,
        BarcodeFormat.CODE_93,
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      this._zxingReader = new BrowserMultiFormatReader(hints);
    }
    return this._zxingReader;
  }

  // Process image with ZXing
  async _processWithZXing(imageSource) {
    try {
      const reader = this._initZXingReader();
      const result = await reader.decodeFromImage(imageSource);
      return {
        code: result.getText(),
        format: result.getBarcodeFormat().toString(),
        resultPoints: result.getResultPoints(),
      };
    } catch (e) {
      console.log("ZXing could not detect barcode:", e);
      return null;
    }
  }

  // Convert ZXing points to Quagga-compatible box format
  _zxingPointsToBox(points) {
    if (!points || points.length < 3) return null;

    // ZXing typically returns 4 corner points for QR codes, but may return fewer for 1D barcodes
    // We'll create a rectangle from the points we have
    const box = [];

    if (points.length >= 4) {
      // Use all 4 points
      for (let i = 0; i < 4; i++) {
        box.push([points[i].getX(), points[i].getY()]);
      }
    } else {
      // For 1D barcodes, create a rectangle from the available points
      const xs = points.map((p) => p.getX());
      const ys = points.map((p) => p.getY());
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      box.push([minX, minY]);
      box.push([maxX, minY]);
      box.push([maxX, maxY]);
      box.push([minX, maxY]);
    }

    return box;
  }

  async scanImageForBarcodes(img) {
    try {
      // Setup UI as before
      this.refs.quaggaModal.style.display = "flex";
      this._lastBoxes = null;
      this._lastCodes = [];
      this._videoDims = null;
      this._clearOverlay();

      const container = this.refs.quaggaContainer;
      const overlay = this.refs.quaggaOverlay;

      // Clear previous content
      container.innerHTML = "";

      // Set dimensions based on image
      this._videoDims = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };

      // Create a canvas to draw the image
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Display the image in the container
      container.appendChild(img);
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.objectFit = "contain";

      // Add the overlay to the container
      container.appendChild(overlay);

      // Show a loading message on the overlay
      try {
        const loadingCtx = overlay.getContext("2d");
        overlay.width = img.naturalWidth;
        overlay.height = img.naturalHeight;
        loadingCtx.fillStyle = "rgba(0,0,0,0.7)";
        loadingCtx.fillRect(overlay.width / 2 - 150, overlay.height / 2 - 20, 300, 40);
        loadingCtx.fillStyle = "rgba(255,255,255,1)";
        loadingCtx.font = "bold 24px sans-serif";
        loadingCtx.textAlign = "center";
        loadingCtx.fillText("Scanning barcodes...", overlay.width / 2, overlay.height / 2);
      } catch (e) {
        console.error("Error drawing loading message:", e);
      }

      // Setup overlay
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "auto";
      overlay.style.zIndex = "10";

      // Add click listener
      try {
        overlay.removeEventListener("click", this._onOverlayClick);
        overlay.addEventListener("click", this._onOverlayClick);
      } catch (e) {
        console.error("Error setting up click listener:", e);
      }

      // Process with both libraries
      setTimeout(async () => {
        try {
          // First try with ZXing
          const zxingResult = await this._processWithZXing(img);

          // Then try with Quagga
          Quagga.decodeSingle(
            {
              decoder: {
                readers: [
                  "code_128_reader",
                  "ean_reader",
                  "ean_8_reader",
                  "upc_reader",
                  "upc_e_reader",
                  "code_39_reader",
                  "code_39_vin_reader",
                  "codabar_reader",
                  "i2of5_reader",
                  "2of5_reader",
                  "code_93_reader",
                ],
                multiple: true,
                debug: {
                  showCanvas: true,
                  showPatches: true,
                  showFoundPatches: true,
                },
              },
              locate: true,
              src: canvas.toDataURL("image/jpeg", 1.0),
              locator: {
                patchSize: "medium",
                halfSample: true,
              },
              frequency: 1,
            },
            (quaggaResult) => {
              try {
                console.log("Quagga result:", quaggaResult);
                console.log("ZXing result:", zxingResult);

                // Make sure the overlay is still in the DOM
                if (!container.contains(overlay)) {
                  container.appendChild(overlay);
                }

                // Clear the overlay
                const ctx = overlay.getContext("2d");
                ctx.clearRect(0, 0, overlay.width, overlay.height);

                // Combine results from both libraries
                let detectedCodes = [];
                let detectedBoxes = [];

                // Process Quagga results
                if (quaggaResult && quaggaResult.codeResult) {
                  detectedCodes.push({
                    code: quaggaResult.codeResult.code,
                    format: quaggaResult.codeResult.format,
                    source: "quagga",
                  });

                  if (quaggaResult.box) {
                    const boxCopy = quaggaResult.box.slice();
                    boxCopy.code = quaggaResult.codeResult.code;
                    detectedBoxes.push(boxCopy);
                  }
                }

                // Process ZXing results
                if (zxingResult) {
                  // Only add if not already detected by Quagga
                  if (!detectedCodes.some((c) => c.code === zxingResult.code)) {
                    detectedCodes.push({
                      code: zxingResult.code,
                      format: zxingResult.format,
                      source: "zxing",
                    });

                    const zxingBox = this._zxingPointsToBox(zxingResult.resultPoints);
                    if (zxingBox) {
                      zxingBox.code = zxingResult.code;
                      detectedBoxes.push(zxingBox);
                    }
                  }
                }

                // Update state with detected codes
                this._lastCodes = detectedCodes.map((c) => c.code);
                this._lastBoxes = detectedBoxes;

                // Draw results
                if (detectedCodes.length > 0) {
                  // Draw boxes
                  detectedBoxes.forEach((box, index) => {
                    // Use different colors for different sources
                    const isZXing = detectedCodes[index]?.source === "zxing";
                    ctx.strokeStyle = isZXing ? "rgba(0,0,255,1)" : "rgba(0,255,0,1)";
                    ctx.lineWidth = 5;

                    ctx.beginPath();
                    ctx.moveTo(box[0][0], box[0][1]);
                    for (let i = 1; i < box.length; i++) {
                      ctx.lineTo(box[i][0], box[i][1]);
                    }
                    ctx.closePath();
                    ctx.stroke();

                    // Add code label
                    if (box.code) {
                      // Get the minimum x and y coordinates to position text above the box
                      const xs = box.map((pt) => pt[0]);
                      const ys = box.map((pt) => pt[1]);
                      const x0 = Math.min(...xs);
                      const y0 = Math.min(...ys);

                      // Add background for text
                      ctx.fillStyle = "rgba(0,0,0,0.7)";
                      ctx.fillRect(x0, y0 - 30, 200, 25);

                      // Draw text
                      ctx.fillStyle = isZXing ? "rgba(0,0,255,1)" : "rgba(0,255,0,1)";
                      ctx.font = "bold 20px sans-serif";
                      ctx.fillText(box.code, x0 + 5, y0 - 8);
                    }
                  });
                } else {
                  // No barcode found
                  ctx.fillStyle = "rgba(0,0,0,0.7)";
                  ctx.fillRect(overlay.width / 2 - 150, overlay.height / 2 - 20, 300, 40);

                  ctx.fillStyle = "rgba(255,0,0,1)";
                  ctx.font = "bold 24px sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText("No barcode detected", overlay.width / 2, overlay.height / 2);
                }
              } catch (e) {
                console.error("Error processing results:", e);
              }
            },
          );
        } catch (e) {
          console.error("Error in barcode processing:", e);
        }
      }, 500);
    } catch (e) {
      console.error("Error in scanImageForBarcodes:", e);
    }
  }

  openQuaggaModal() {
    this.refs.quaggaModal.style.display = "flex";
    this._lastBoxes = null;
    this._lastCodes = [];
    this._videoDims = null;
    this._isVideoFrozen = false;
    this._clearOverlay();

    const overlay = this.refs.quaggaOverlay;
    const container = this.refs.quaggaContainer;
    const freezeButton = this.refs.freezeButton;

    // Reset freeze button
    freezeButton.innerHTML = '<i class="fa fa-camera" style="font-size: 24px;"></i>';
    freezeButton.style.background = "rgba(255,255,255,0.8)";
    freezeButton.style.display = "flex"; // Ensure button is visible

    // Clear any previous content
    container.innerHTML = "";

    // Make sure the overlay is in the DOM and positioned correctly
    if (!container.contains(overlay)) {
      container.appendChild(overlay);
    }

    // Make sure the freeze button is in the DOM
    if (!container.contains(freezeButton)) {
      container.appendChild(freezeButton);
    }

    overlay.style.pointerEvents = "auto";
    overlay.style.zIndex = "10";
    overlay.addEventListener("click", this._onOverlayClick);

    // Initialize ZXing reader
    this._initZXingReader();

    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: this.refs.quaggaContainer,
        constraints: {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        area: { top: "0%", right: "0%", left: "0%", bottom: "0%" },
        willReadFrequently: true,
      },
      locator: {
        patchSize: "medium",
        halfSample: true,
      },
      decoder: {
        readers: [
          "code_128_reader",
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
          "code_39_reader",
          "code_39_vin_reader",
          "codabar_reader",
          "i2of5_reader",
          "2of5_reader",
          "code_93_reader",
        ],
        multiple: true,
        debug: {
          showCanvas: false,
          showPatches: false,
          showFoundPatches: false,
        },
        frequency: 10,
      },
      locate: true,
      numOfWorkers: 2,
    };

    window.Quagga.init(config, (err) => {
      if (err) {
        console.error("Quagga init error:", err);
        const container = this.refs.quaggaContainer;
        container.innerHTML = `
          <div style="
            color: white;
            text-align: center;
            padding: 20px;
            font-size: 1rem;
          ">
            🚫 Camera failed to start:<br>
            ${err.name || err.message}
          </div>`;
        return;
      }

      // Get video dimensions before starting
      setTimeout(() => {
        const videoEl = container.querySelector("video");
        if (videoEl) {
          // Store reference to video element
          this._videoElement = videoEl;

          this._videoDims = {
            width: videoEl.videoWidth || 640,
            height: videoEl.videoHeight || 480,
          };

          // Set overlay dimensions to match video
          overlay.width = this._videoDims.width;
          overlay.height = this._videoDims.height;

          console.log("Video dimensions set to:", this._videoDims);
        }

        window.Quagga.start();

        // Hide the drawingBuffer canvas that Quagga creates
        setTimeout(() => {
          const canvas = document.querySelector("canvas.drawingBuffer");
          if (canvas) canvas.style.display = "none";
        }, 50);

        // Make sure our overlay is on top
        if (container.contains(overlay)) {
          container.appendChild(overlay);
        }

        // Add the freeze button to the container
        if (container.contains(this.refs.freezeButton)) {
          container.appendChild(this.refs.freezeButton);
        }

        // Start Quagga processing first, then ZXing as a backup
        this._startQuaggaProcessing();

        // Delay ZXing setup to ensure Quagga is running smoothly first
        setTimeout(() => {
          this._setupZXingVideoProcessing();
        }, 1000);
      }, 300);
    });
  }

  // Setup ZXing to process video frames
  _setupZXingVideoProcessing() {
    try {
      // Clear any existing interval
      if (this._zxingInterval) {
        clearInterval(this._zxingInterval);
        this._zxingInterval = null;
      }

      // Since ZXing is having trouble detecting barcodes that Quagga can detect,
      // we'll reduce the frequency of ZXing processing to avoid performance issues
      // and rely more on Quagga for primary detection

      const container = this.refs.quaggaContainer;
      const videoEl = container.querySelector("video");

      if (!videoEl) {
        console.warn("No video element found for ZXing processing");
        return;
      }

      // Create a canvas for capturing video frames
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Process video frames with ZXing at a lower frequency (every 1.5 seconds)
      this._zxingInterval = setInterval(async () => {
        try {
          // Skip ZXing processing if we already have detected codes from Quagga
          if (this._lastCodes.length > 0) {
            return;
          }

          if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            // Capture a frame from the video
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

            // Convert canvas to image URL
            const imageUrl = canvas.toDataURL("image/jpeg", 0.8);

            // Create an image element
            const img = new Image();
            img.onload = async () => {
              try {
                // Use decodeFromImage
                const zxingResult = await this._zxingReader.decodeFromImage(img);

                if (zxingResult) {
                  console.log("ZXing detected barcode:", zxingResult);

                  // Create a box from ZXing result points
                  const box = this._zxingPointsToBox(zxingResult.getResultPoints());

                  if (box) {
                    // Add code to the box
                    box.code = zxingResult.getText();
                    box.format = zxingResult.getBarcodeFormat().toString();
                    box.source = "zxing";

                    // Add to detected codes if not already present
                    if (!this._lastCodes.includes(box.code)) {
                      this._lastCodes.push(box.code);
                    }

                    // Add to boxes if not already present
                    if (!this._lastBoxes) {
                      this._lastBoxes = [];
                    }

                    // Check if we already have this box
                    const boxExists = this._lastBoxes.some(
                      (existingBox) =>
                        existingBox.code === box.code && existingBox.source === "zxing",
                    );

                    if (!boxExists) {
                      this._lastBoxes.push(box);
                    }
                  }
                }
              } catch (e) {
                // ZXing throws when no barcode is found, so we can ignore this error
                if (e.name !== "NotFoundException") {
                  console.error("Error in ZXing image processing:", e);
                }
              }
            };
            img.src = imageUrl;
          }
        } catch (e) {
          console.error("Error in ZXing processing:", e);
        }
      }, 1500); // Process every 1.5 seconds to reduce load
    } catch (e) {
      console.error("Error setting up ZXing video processing:", e);
    }
  }

  _startQuaggaProcessing() {
    try {
      const overlay = this.refs.quaggaOverlay;
      const container = this.refs.quaggaContainer;
      const videoEl = container.querySelector("video");

      // Debug info
      console.log("Starting Quagga processing");
      console.log("Overlay exists:", !!overlay);
      console.log("Container exists:", !!container);
      console.log("Video element exists:", !!videoEl);

      if (!videoEl) {
        console.warn("No video element found, cannot start processing");
        return;
      }

      // Wait for video dimensions if not already set
      if (!this._videoDims && videoEl) {
        this._videoDims = {
          width: videoEl.videoWidth || 640,
          height: videoEl.videoHeight || 480,
        };
      }

      console.log("Video dimensions:", this._videoDims);

      // Ensure overlay is properly sized and positioned
      overlay.width = this._videoDims.width;
      overlay.height = this._videoDims.height;

      // Position overlay exactly over the video
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";

      // Force overlay to be visible
      overlay.style.display = "block";
      overlay.style.pointerEvents = "auto";
      overlay.style.zIndex = "10";

      // Reduce processing frequency to prevent performance issues
      let processCount = 0;

      window.Quagga.onProcessed((result) => {
        try {
          // Only process every 3rd frame to reduce load
          processCount++;
          if (processCount % 3 !== 0) return;

          const ctx = overlay.getContext("2d");
          if (!ctx) {
            console.error("Could not get overlay context");
            return;
          }

          // Clear the entire canvas
          ctx.clearRect(0, 0, overlay.width, overlay.height);

          // Process boxes from the result
          let rawBoxes = [];

          if (result && Array.isArray(result)) {
            rawBoxes = result
              .filter((item) => item && item.box && Array.isArray(item.box))
              .map((item) => {
                const boxCopy = item.box.slice();
                if (item.codeResult && item.codeResult.code) {
                  boxCopy.code = item.codeResult.code || "test";
                  //boxCopy.format = item.codeResult.format;
                }
                return boxCopy;
              });
          }

          this._lastBoxes = rawBoxes;

          // Draw all boxes
          if (this._lastBoxes && this._lastBoxes.length > 0) {
            this._lastBoxes.forEach((box, index) => {
              try {
                if (box && box.length >= 4) {
                  if (box.code) {
                    // Use different colors for different sources
                    ctx.strokeStyle =
                      box.source === "zxing" ? "rgba(0,0,255,1)" : "rgba(0,255,0,1)";
                    ctx.lineWidth = 3;

                    ctx.beginPath();
                    ctx.moveTo(box[0][0], box[0][1]);
                    for (let i = 1; i < box.length; i++) {
                      ctx.lineTo(box[i][0], box[i][1]);
                    }
                    ctx.closePath();

                    ctx.stroke();
                    // Add code label
                    // Get the minimum x and y coordinates to position text above the box
                    const xs = box.map((pt) => pt[0]);
                    const ys = box.map((pt) => pt[1]);
                    const x0 = Math.min(...xs);
                    const y0 = Math.min(...ys);

                    // Add background for text
                    ctx.fillStyle = "rgba(0,0,0,0.7)";
                    ctx.fillRect(x0, y0 - 30, 200, 25);

                    // Draw text
                    ctx.fillStyle = box.source === "zxing" ? "rgba(0,0,255,1)" : "rgba(0,255,0,1)";
                    ctx.font = "bold 20px sans-serif";
                    ctx.fillText(box.code, x0 + 5, y0 - 8);
                  }
                }
              } catch (e) {
                console.error(`Error drawing box:`, e);
              }
            });
          }

          // If we have detected codes but no boxes, show a message
          if (this._lastCodes.length > 0 && (!this._lastBoxes || this._lastBoxes.length === 0)) {
            ctx.font = "20px Arial";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText(
              `${this._lastCodes.length} barcode(s) detected`,
              overlay.width / 2,
              overlay.height / 2 - 20,
            );
            ctx.fillText("Tap to select", overlay.width / 2, overlay.height / 2 + 20);
          }
        } catch (e) {
          console.error("Error in onProcessed:", e);
        }
      });

      window.Quagga.onDetected((data) => {
        try {
          // Add to detected codes if not already present
          if (data.codeResult && data.codeResult.code) {
            const newCode = data.codeResult.code;

            if (!this._lastCodes.includes(newCode)) {
              this._lastCodes.push(newCode);

              // Visual feedback
              this.refs.quaggaModal.style.border = "4px solid lime";
              setTimeout(() => {
                this.refs.quaggaModal.style.border = "";
              }, 400);
            }

            // Add box if available
            if (data.box) {
              // Normalize box format
              const normalizedBox = this._normalizeBoxFormat(data.box);

              if (normalizedBox) {
                // Add code and format info to the box
                normalizedBox.code = newCode;
                normalizedBox.format = data.codeResult.format;
                normalizedBox.source = "quagga";

                if (!this._lastBoxes) {
                  this._lastBoxes = [];
                }

                // Check if we already have this box
                const boxExists = this._lastBoxes.some(
                  (existingBox) =>
                    existingBox.code === normalizedBox.code && existingBox.source === "quagga",
                );

                if (!boxExists) {
                  this._lastBoxes.push(normalizedBox);
                }
              }
            }
          }
        } catch (e) {
          console.error("Error in onDetected:", e);
        }
      });
    } catch (e) {
      console.error("Error in _startQuaggaProcessing:", e);
    }
  }

  // Normalize box format to ensure consistent structure
  _normalizeBoxFormat(box) {
    if (!box || !Array.isArray(box)) return null;

    // If box is already in the format we want (array of [x,y] pairs)
    if (box.length >= 4 && Array.isArray(box[0]) && box[0].length === 2) {
      return box;
    }

    // If box is in the format [0: [x,y], 1: [x,y], 2: [x,y], 3: [x,y]]
    if (
      box.length === 4 &&
      typeof box[0] === "object" &&
      "0" in box &&
      "1" in box &&
      "2" in box &&
      "3" in box
    ) {
      return [box[0], box[1], box[2], box[3]];
    }

    // If box is in the format [x1, y1, x2, y2, x3, y3, x4, y4]
    if (box.length === 8 && typeof box[0] === "number") {
      return [
        [box[0], box[1]],
        [box[2], box[3]],
        [box[4], box[5]],
        [box[6], box[7]],
      ];
    }

    // If box is in another format with numbered indices
    if ("0" in box && "1" in box && "2" in box && "3" in box) {
      return [box[0], box[1], box[2], box[3]];
    }

    console.warn("Unknown box format:", box);
    return null;
  }

  // Helper methods for box matching
  _getBoxCenter(box) {
    try {
      if (!box || !Array.isArray(box) || box.length < 4) {
        return { x: 0, y: 0 };
      }

      // Calculate center of the box
      let sumX = 0,
        sumY = 0;

      for (let i = 0; i < box.length; i++) {
        if (Array.isArray(box[i]) && box[i].length >= 2) {
          sumX += box[i][0];
          sumY += box[i][1];
        }
      }

      return {
        x: sumX / box.length,
        y: sumY / box.length,
      };
    } catch (e) {
      console.error("Error calculating box center:", e);
      return { x: 0, y: 0 };
    }
  }

  _getDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _matchAndSmoothBoxes(rawBoxes) {
    const α = this._SMOOTH_ALPHA;
    const maxLost = this._MAX_LOST_FRAMES;

    if (!this._smoothedBoxes) {
      this._smoothedBoxes = rawBoxes.map((b) => b.slice());
      this._lostCounts = new Array(rawBoxes.length).fill(0);
      return;
    }

    const oldBoxes = this._smoothedBoxes;
    const oldLost = this._lostCounts || new Array(oldBoxes.length).fill(0);
    const newSmoothed = [];
    const newLost = [];

    const rawCentroids = rawBoxes.map((box) => {
      const cx = (box[0][0] + box[1][0] + box[2][0] + box[3][0]) / 4;
      const cy = (box[0][1] + box[1][1] + box[2][1] + box[3][1]) / 4;
      return [cx, cy];
    });
    const oldCentroids = oldBoxes.map((box) => {
      const cx = (box[0][0] + box[1][0] + box[2][0] + box[3][0]) / 4;
      const cy = (box[0][1] + box[1][1] + box[2][1] + box[3][1]) / 4;
      return [cx, cy];
    });

    const usedRaw = new Set();
    const matches = new Array(oldBoxes.length).fill(-1);

    oldCentroids.forEach((oldC, i) => {
      let bestJ = -1;
      let bestDist = Infinity;
      rawCentroids.forEach((rawC, j) => {
        if (usedRaw.has(j)) return;
        const dx = oldC[0] - rawC[0];
        const dy = oldC[1] - rawC[1];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          bestJ = j;
        }
      });
      const MAX_CENTROID_DIST_SQ = 250 * 250;
      if (bestJ >= 0 && bestDist < MAX_CENTROID_DIST_SQ) {
        matches[i] = bestJ;
        usedRaw.add(bestJ);
      }
    });

    oldBoxes.forEach((oldBox, i) => {
      const rawIdx = matches[i];
      if (rawIdx >= 0) {
        const rawBox = rawBoxes[rawIdx];
        const smBox = oldBox.slice();

        for (let k = 0; k < 4; k++) {
          smBox[k][0] = smBox[k][0] * (1 - α) + rawBox[k][0] * α;
          smBox[k][1] = smBox[k][1] * (1 - α) + rawBox[k][1] * α;
        }

        newSmoothed.push(smBox);
        newLost.push(0);
      } else {
        const lostCount = (oldLost[i] || 0) + 1;
        if (lostCount < maxLost) {
          newSmoothed.push(oldBox);
          newLost.push(lostCount);
        }
      }
    });

    rawBoxes.forEach((rawBox, j) => {
      if (!usedRaw.has(j)) {
        const newPoly = rawBox.map((pt) => pt.slice());
        newSmoothed.push(newPoly);
        newLost.push(0);
      }
    });

    this._smoothedBoxes = newSmoothed;
    this._lostCounts = newLost;
  }

  _onOverlayClick(event) {
    try {
      const overlay = this.refs.quaggaOverlay;
      const rect = overlay.getBoundingClientRect();
      const clickX = (event.clientX - rect.left) * (overlay.width / rect.width);
      const clickY = (event.clientY - rect.top) * (overlay.height / rect.height);

      console.log("Click coordinates:", clickX, clickY);

      // If we have detected codes but no boxes, create a simple selection UI
      if (this._lastCodes.length > 0 && (!this._lastBoxes || this._lastBoxes.length === 0)) {
        // Select the first code if no specific box was clicked
        const codeToUse = this._lastCodes[0];
        this.updateValue(codeToUse);
        this.refs.barcode.value = codeToUse;
        this.stopQuagga();
        this.refs.quaggaModal.style.display = "none";
        return;
      }

      // Check if click is inside any of the detected barcode boxes
      for (const poly of this._lastBoxes || []) {
        try {
          if (this._pointInPolygon(clickX, clickY, poly)) {
            console.log("Box clicked:", poly);
            // Use the code associated with this box
            const codeToUse = poly.code || "";
            this.updateValue(codeToUse);
            this.refs.barcode.value = codeToUse;
            this.stopQuagga();
            this.refs.quaggaModal.style.display = "none";
            this._clearOverlay();
            this._lastBoxes = null;
            this._lastCodes = [];
            this._videoDims = null;
            overlay.removeEventListener("click", this._onOverlayClick);
            return;
          }
        } catch (e) {
          console.error("Error checking if point is in polygon:", e, poly);
        }
      }

      // If no box was clicked but we have detected codes, show a selection UI
      if (this._lastCodes.length > 0) {
        this._showCodeSelectionUI();
      }
    } catch (e) {
      console.error("Error in overlay click handler:", e);
    }
  }

  // Show a UI for selecting from multiple detected barcodes
  _showCodeSelectionUI() {
    try {
      // Create a selection UI if we have multiple codes
      if (this._lastCodes.length > 0) {
        const container = this.refs.quaggaContainer;

        // Create selection UI element
        const selectionUI = document.createElement("div");
        selectionUI.className = "barcode-selection-ui";
        selectionUI.style.position = "absolute";
        selectionUI.style.bottom = "10px";
        selectionUI.style.left = "10px";
        selectionUI.style.right = "10px";
        selectionUI.style.background = "rgba(0,0,0,0.7)";
        selectionUI.style.color = "white";
        selectionUI.style.padding = "10px";
        selectionUI.style.borderRadius = "5px";
        selectionUI.style.zIndex = "20";

        // Add title
        const title = document.createElement("div");
        title.textContent = "Select a barcode:";
        title.style.marginBottom = "10px";
        title.style.fontWeight = "bold";
        selectionUI.appendChild(title);

        // Add buttons for each code
        this._lastCodes.forEach((code, index) => {
          const button = document.createElement("button");
          button.textContent = `${code} (${this._getFormatForCode(code) || "unknown"})`;
          button.style.margin = "5px";
          button.style.padding = "8px 12px";
          button.style.border = "none";
          button.style.borderRadius = "4px";
          button.style.background = "#4CAF50";
          button.style.color = "white";
          button.style.cursor = "pointer";

          button.addEventListener("click", () => {
            this.updateValue(code);
            this.refs.barcode.value = code;
            this.stopQuagga();
            this.refs.quaggaModal.style.display = "none";
            this._clearOverlay();
            this._lastBoxes = null;
            this._lastCodes = [];
            this._videoDims = null;
          });

          selectionUI.appendChild(button);
        });

        // Add to container
        container.appendChild(selectionUI);
      }
    } catch (e) {
      console.error("Error showing code selection UI:", e);
    }
  }

  // Helper to get format for a code
  _getFormatForCode(code) {
    if (!this._lastBoxes) return null;

    const box = this._lastBoxes.find((b) => b.code === code);
    return box ? box.format : null;
  }

  _pointInPolygon(x, y, polygon) {
    try {
      if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
      }

      let inside = false;

      // Convert polygon to array of points if needed
      const points = polygon.map((point) => {
        if (Array.isArray(point) && point.length >= 2) {
          return { x: point[0], y: point[1] };
        } else if (point && typeof point === "object" && "x" in point && "y" in point) {
          return point;
        } else {
          console.warn("Invalid point format in polygon:", point);
          return { x: 0, y: 0 };
        }
      });

      // Ray casting algorithm
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x,
          yi = points[i].y;
        const xj = points[j].x,
          yj = points[j].y;

        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
      }

      return inside;
    } catch (e) {
      console.error("Error in _pointInPolygon:", e);
      return false;
    }
  }

  _clearOverlay() {
    try {
      if (this.refs.quaggaOverlay) {
        const ctx = this.refs.quaggaOverlay.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, this.refs.quaggaOverlay.width, this.refs.quaggaOverlay.height);
        }
      }
    } catch (e) {
      console.error("Error in _clearOverlay:", e);
    }
  }

  stopQuagga() {
    this._firstOpen = false;
    try {
      // Clear ZXing interval
      if (this._zxingInterval) {
        clearInterval(this._zxingInterval);
        this._zxingInterval = null;
      }

      // Reset ZXing reader
      if (this._zxingReader) {
        this._zxingReader.reset();
      }

      window.Quagga.offProcessed();
      window.Quagga.offDetected();
      window.Quagga.stop();
    } catch (e) {
      console.error("Error stopping barcode scanners:", e);
    }

    // Don't remove the overlay from the DOM, just clear it
    this._clearOverlay();

    // Clear the container when stopping, but preserve the overlay
    if (this.refs.quaggaContainer) {
      const overlay = this.refs.quaggaOverlay;
      const container = this.refs.quaggaContainer;

      // Remove overlay from container temporarily
      if (container.contains(overlay)) {
        container.removeChild(overlay);
      }

      // Clear container
      container.innerHTML = "";
    }
  }

  detach() {
    if (this.refs.barcode) {
      this.refs.barcode.removeEventListener("change", () =>
        this.updateValue(this.refs.barcode.value),
      );
    }
    if (this.refs.scanButton) {
      this.refs.scanButton.removeEventListener("click", this.openQuaggaModal);
    }
    if (this.refs.fileButton) {
      this.refs.fileButton.removeEventListener("click", () => this.refs.fileInput.click());
    }
    if (this.refs.fileInput) {
      this.refs.fileInput.removeEventListener("change", this.processImageFile);
    }
    if (this.refs.closeModal) {
      this.refs.closeModal.removeEventListener("click", this.stopQuagga);
    }
    if (this.refs.quaggaOverlay) {
      this.refs.quaggaOverlay.removeEventListener("click", this._onOverlayClick);
    }
    return super.detach();
  }

  destroy() {
    if (this._zxingReader) {
      this._zxingReader.reset();
      this._zxingReader = null;
    }

    if (this._zxingInterval) {
      clearInterval(this._zxingInterval);
      this._zxingInterval = null;
    }

    this.stopQuagga();
    return super.destroy();
  }

  normalizeValue(value, flags = {}) {
    return super.normalizeValue(value, flags);
  }

  getValue() {
    return super.getValue();
  }

  getValueAt(index) {
    return super.getValueAt(index);
  }

  setValue(value, flags = {}) {
    super.setValue(value, flags);
    if (this.refs.barcode) {
      this.refs.barcode.value = value || "";
    }
  }

  setValueAt(index, value, flags = {}) {
    return super.setValueAt(index, value, flags);
  }

  updateValue(value, flags = {}) {
    return super.updateValue(...arguments);
  }

  // Toggle between frozen and live video
  _toggleFreezeVideo() {
    try {
      this._isVideoFrozen = !this._isVideoFrozen;

      // Update button appearance
      if (this._isVideoFrozen) {
        this.refs.freezeButton.innerHTML = '<i class="fa fa-play" style="font-size: 24px;"></i>';
        this.refs.freezeButton.style.background = "rgba(0,255,0,0.8)";

        // Capture current frame to canvas
        const videoEl = this.refs.quaggaContainer.querySelector("video");
        if (videoEl) {
          // Create a canvas to capture the current frame
          const canvas = document.createElement("canvas");
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          const ctx = canvas.getContext("2d");

          // Draw the current video frame to the canvas
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

          // Create an image from the canvas
          const img = new Image();
          img.src = canvas.toDataURL("image/jpeg", 1.0);

          // Style the image to match the video
          img.style.position = "absolute";
          img.style.top = "0";
          img.style.left = "0";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "contain";
          img.style.zIndex = "5";

          // Add the image to the container
          this.refs.quaggaContainer.appendChild(img);

          // Pause Quagga processing
          window.Quagga.pause();
        }
      } else {
        this.refs.freezeButton.innerHTML = '<i class="fa fa-camera" style="font-size: 24px;"></i>';
        this.refs.freezeButton.style.background = "rgba(255,255,255,0.8)";

        // Remove any frozen frame images
        const frozenFrames = this.refs.quaggaContainer.querySelectorAll("img");
        frozenFrames.forEach((img) => img.remove());

        // Resume Quagga processing
        window.Quagga.start();
      }
    } catch (e) {
      console.error("Error toggling video freeze:", e);
    }
  }
}

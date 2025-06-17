import { Components } from "@formio/js";
import Quagga from "quagga";
import BarcodeScannerEditForm from "./BarcodeScanner.form";

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
    this._lastCodes = [];  // Changed from _lastCode to _lastCodes array
    this._videoDims = null;
    this._smoothedBoxes = null;  
    this._lostCounts = null;   
    this._boxColors = {};  // Store colors by box ID
    this._nextBoxId = 1;   // Counter for generating unique box IDs
    this._SMOOTH_ALPHA = 0.075;      // lower alpha = smoother, less responsive
    this._MAX_LOST_FRAMES = 10;    // number of frames to keep a polygon after detection lost
    this._onOverlayClick = this._onOverlayClick.bind(this);
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
            <i class="fa fa-camera"></i>
          </button>
          <button ref="fileButton" type="button" class="btn btn-primary">
            <i class="fa fa-file-image-o"></i>
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
                  top:0; left:64px !important;
                  width:100%;
                  height:100%;
                  cursor:pointer;
                  z-index:10;
                ">
              </canvas>
            </div>
          </div>
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
    });

    if (
      !this.refs.barcode ||
      !this.refs.scanButton ||
      !this.refs.fileButton ||
      !this.refs.fileInput ||
      !this.refs.quaggaModal ||
      !this.refs.quaggaContainer ||
      !this.refs.quaggaOverlay ||
      !this.refs.closeModal
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
        this._lastCodes = [];  // Reset to empty array
        this._videoDims = null;
        this.refs.quaggaOverlay.removeEventListener("click", this._onOverlayClick);
        
        // Clear the container when closing
        if (this.refs.quaggaContainer) {
          this.refs.quaggaContainer.innerHTML = '';
        }
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

  scanImageForBarcodes(img) {
    try {
      this.refs.quaggaModal.style.display = "flex";
      this._lastBoxes = null;
      this._lastCodes = [];  // Reset to empty array
      this._videoDims = null;
      this._clearOverlay();

      const container = this.refs.quaggaContainer;
      const overlay = this.refs.quaggaOverlay;
      
      // Clear any previous content
      container.innerHTML = '';
      
      // Set dimensions based on image
      this._videoDims = {
        width: img.naturalWidth,
        height: img.naturalHeight
      };
      
      // Create a canvas to draw the image
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
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
        const loadingCtx = overlay.getContext('2d');
        overlay.width = img.naturalWidth;
        overlay.height = img.naturalHeight;
        loadingCtx.fillStyle = "rgba(0,0,0,0.7)";
        loadingCtx.fillRect(overlay.width/2 - 150, overlay.height/2 - 20, 300, 40);
        loadingCtx.fillStyle = "rgba(255,255,255,1)";
        loadingCtx.font = "bold 24px sans-serif";
        loadingCtx.textAlign = "center";
        loadingCtx.fillText("Scanning barcodes...", overlay.width/2, overlay.height/2);
      } catch (e) {
        console.error("Error drawing loading message:", e);
      }
      
      // Position the overlay correctly
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.pointerEvents = "auto";
      overlay.style.zIndex = "10";
      
      // Make sure we remove any previous click listeners before adding a new one
      try {
        overlay.removeEventListener("click", this._onOverlayClick);
        overlay.addEventListener("click", this._onOverlayClick);
      } catch (e) {
        console.error("Error setting up click listener:", e);
      }
      
      console.log("Image dimensions:", img.naturalWidth, "x", img.naturalHeight);
      console.log("Displayed dimensions:", img.clientWidth, "x", img.clientHeight);
      console.log("Overlay dimensions:", overlay.width, "x", overlay.height);
      
      // Process with Quagga with a delay to ensure DOM is ready
      setTimeout(() => {
        try {
          Quagga.decodeSingle({
            decoder: {
              readers: [
                'code_128_reader',
                'ean_reader',
                'ean_8_reader',
                'upc_reader',
                'upc_e_reader',
                'code_39_reader',
                'code_39_vin_reader',
                'codabar_reader',
                'i2of5_reader',
                '2of5_reader',
                'code_93_reader'
              ],
              multiple: true  // Enable multiple barcode detection
            },
            locate: true,
            src: canvas.toDataURL()
          }, (result) => {
            try {
              console.log("Quagga result:", result);
              
              // Make sure the overlay is still in the DOM
              if (!container.contains(overlay)) {
                container.appendChild(overlay);
              }
              
              // Clear the overlay
              try {
                const ctx = overlay.getContext("2d");
                ctx.clearRect(0, 0, overlay.width, overlay.height);
                
                if (result && result.codeResult) {
                  // Found at least one barcode
                  this._lastCodes = [result.codeResult.code];  // Start with the primary code
                  console.log("Detected primary code:", result.codeResult.code);
                  
                  // Draw boxes
                  if (result.box) {
                    // Store box for click detection
                    this._lastBoxes = [result.box.slice()];
                    this._lastBoxes[0].code = result.codeResult.code;
                    
                    // Draw the main box in green
                    ctx.strokeStyle = "rgba(0,255,0,1)";
                    ctx.lineWidth = 5; // Make lines thicker
                    ctx.beginPath();
                    ctx.moveTo(result.box[0][0], result.box[0][1]);
                    for (let i = 1; i < result.box.length; i++) {
                      ctx.lineTo(result.box[i][0], result.box[i][1]);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    
                    // Display the code with background for better visibility
                    const xs = result.box.map(pt => pt[0]);
                    const ys = result.box.map(pt => pt[1]);
                    const x0 = Math.min(...xs);
                    const y0 = Math.min(...ys);
                    
                    // Add background for text
                    ctx.fillStyle = "rgba(0,0,0,0.7)";
                    ctx.fillRect(x0, y0 - 30, 200, 25);
                    
                    // Draw text with better positioning and overflow handling
                    ctx.fillStyle = "rgba(0,255,0,1)";
                    ctx.font = "bold 20px sans-serif";
                    ctx.textBaseline = "middle";
                    
                    // Truncate long codes if needed
                    const maxWidth = 190; // Slightly less than background width
                    let displayCode = result.codeResult.code;
                    let textWidth = ctx.measureText(displayCode).width;
                    
                    if (textWidth > maxWidth) {
                      // Truncate and add ellipsis
                      while (textWidth > maxWidth - 20 && displayCode.length > 3) {
                        displayCode = displayCode.slice(0, -1);
                        textWidth = ctx.measureText(displayCode + "...").width;
                      }
                      displayCode += "...";
                    }
                    
                    ctx.fillText(displayCode, x0 + 5, y0 - 17); // Centered in background
                  }
                  
                  // Check for additional boxes
                  if (result.boxes && result.boxes.length > 0) {
                    // Store all boxes for click detection if not already stored
                    if (!this._lastBoxes) {
                      this._lastBoxes = [];
                    }
                    
                    // Draw all boxes except the main one
                    const boxes = result.boxes.filter(box => box !== result.box);
                    ctx.strokeStyle = "rgba(255,0,0,0.8)";
                    ctx.lineWidth = 5; // Make lines thicker
                    
                    boxes.forEach((box) => {
                      // Add to lastBoxes if not already there
                      const boxCopy = box.slice().map(point => point.slice());
                      boxCopy.code = result.codeResult.code; // Associate with the detected code
                      this._lastBoxes.push(boxCopy);
                      
                      // Draw the box
                      try {
                        ctx.beginPath();
                        ctx.moveTo(box[0][0], box[0][1]);
                        for (let i = 1; i < box.length; i++) {
                          ctx.lineTo(box[i][0], box[i][1]);
                        }
                        ctx.closePath();
                        ctx.stroke();
                      } catch (e) {
                        console.error("Error drawing box:", e, box);
                      }
                    });
                  }
                } else {
                  // No barcode found
                  ctx.fillStyle = "rgba(0,0,0,0.7)";
                  ctx.fillRect(overlay.width/2 - 150, overlay.height/2 - 20, 300, 40);
                  
                  ctx.fillStyle = "rgba(255,0,0,1)";
                  ctx.font = "bold 24px sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText("No barcode detected", overlay.width/2, overlay.height/2);
                }
              } catch (e) {
                console.error("Error drawing on overlay:", e);
              }
            } catch (e) {
              console.error("Error processing Quagga result:", e);
            }
          });
        } catch (e) {
          console.error("Error initializing Quagga:", e);
          // Show error on overlay
          try {
            const ctx = overlay.getContext("2d");
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(overlay.width/2 - 150, overlay.height/2 - 20, 300, 40);
            ctx.fillStyle = "rgba(255,0,0,1)";
            ctx.font = "bold 24px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Error scanning barcode", overlay.width/2, overlay.height/2);
          } catch (innerError) {
            console.error("Error showing error message:", innerError);
          }
        }
      }, 500);
    } catch (e) {
      console.error("Error in scanImageForBarcodes:", e);
    }
  }

  openQuaggaModal() {
    this.refs.quaggaModal.style.display = "flex";
    this._lastBoxes = null;
    this._lastCodes = [];  // Reset to empty array
    this._videoDims = null;
    this._clearOverlay();

    const overlay = this.refs.quaggaOverlay;
    const container = this.refs.quaggaContainer;
    
    // Clear any previous content
    container.innerHTML = '';
    
    // Make sure the overlay is in the DOM and positioned correctly
    if (!container.contains(overlay)) {
      container.appendChild(overlay);
    }
    
    overlay.style.pointerEvents = "auto";
    overlay.style.zIndex = "10";
    overlay.addEventListener("click", this._onOverlayClick);

    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: this.refs.quaggaContainer,
        constraints: {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        },
        area: { top: "0%", right: "0%", left: "0%", bottom: "0%" },
      },
      locator: { patchSize: "large", halfSample: false },
      decoder: {
        readers: [
          'code_128_reader',
          'ean_reader',        // EAN-13
          'ean_8_reader',      // EAN-8
          'upc_reader',        // UPC-A
          'upc_e_reader',      // UPC-E
          'code_39_reader',
          'code_39_vin_reader',// Code-39 (VIN)
          'codabar_reader',
          'i2of5_reader',      // Interleaved 2 of 5 (ITF)
          '2of5_reader',       // Standard 2 of 5
          'code_93_reader'
        ],
        multiple: true,
      },
      locate: true,
      numOfWorkers: 100,
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
      
      onVideoReady();
    });

    const onVideoReady = () => {
      const video = container.querySelector("video");
      if (!video || !video.videoWidth || !video.videoHeight) {
        return setTimeout(onVideoReady, 50);
      }

      this._videoDims = {
        width: video.videoWidth,
        height: video.videoHeight,
      };
      video.style.maxWidth = "100%";
      video.style.height = "auto";
      video.style.objectFit = "contain";

      const offsetLeft = video.offsetLeft;
      const offsetTop  = video.offsetTop;

      overlay.style.position = "absolute";
      overlay.style.setProperty('left', `${offsetLeft + 64}px`, 'important');
      overlay.style.top      = `${offsetTop}px`;
      overlay.style.width    = video.style.width  || `${this._videoDims.width}px`;
      overlay.style.height   = video.style.height || `${this._videoDims.height}px`;
      overlay.style.zIndex   = "10";

      overlay.width  = this._videoDims.width;
      overlay.height = this._videoDims.height;

      this._startQuaggaProcessing();
    };
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
      console.log("Video dimensions:", this._videoDims);
      
      if (!videoEl || !this._videoDims) {
        console.warn("Missing video element or dimensions, cannot start processing");
        return;
      }

      // Ensure overlay is properly sized and positioned
      overlay.width = this._videoDims.width;
      overlay.height = this._videoDims.height;
      console.log("Set overlay dimensions to:", overlay.width, "x", overlay.height);
      
      // Position overlay exactly over the video
      const videoRect = videoEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      overlay.style.position = "absolute";
      overlay.style.left = `${videoEl.offsetLeft}px`;
      overlay.style.top = `${videoEl.offsetTop}px`;
      overlay.style.width = `${videoRect.width}px`;
      overlay.style.height = `${videoRect.height}px`;
      
      console.log("Video position:", videoEl.offsetLeft, videoEl.offsetTop);
      console.log("Video rect:", videoRect.width, videoRect.height);
      console.log("Overlay style:", overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height);

      // Force overlay to be visible
      overlay.style.display = "block";
      overlay.style.pointerEvents = "auto";
      overlay.style.zIndex = "10";

      window.Quagga.onProcessed((result) => {
        try {
          const ctx = overlay.getContext("2d");
          if (!ctx) {
            console.error("Could not get overlay context");
            return;
          }
          
          // Clear the entire canvas
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          
          // Process boxes from the result
          let rawBoxes = [];
          
          // Handle the format shown in your example
          if (result && Array.isArray(result)) {
            rawBoxes = result
              .filter(item => item && item.box && Array.isArray(item.box))
              .map(item => item.box.slice());
          } 
          // Handle the standard Quagga format
          else if (result && result.boxes && Array.isArray(result.boxes)) {
            rawBoxes = result.boxes
              .filter(box => Array.isArray(box))
              .map(box => box.slice());
          }
          
          // Apply smoothing to the boxes
          this._matchAndSmoothBoxes(rawBoxes);
          
          // Use smoothed boxes for display and click detection
          this._lastBoxes = this._smoothedBoxes || rawBoxes;
          
          // Draw all boxes in green
          if (this._lastBoxes && this._lastBoxes.length > 0) {
            this._lastBoxes.forEach((box) => {
              try {
                if (box && box.length >= 4) {
                  // Use bright green for all boxes
                  ctx.strokeStyle = "rgba(0, 255, 0, 1)";
                  ctx.lineWidth = 5;
                  
                  // Draw the box
                  ctx.beginPath();
                  ctx.moveTo(box[0][0], box[0][1]);
                  for (let i = 1; i < box.length; i++) {
                    ctx.lineTo(box[i][0], box[i][1]);
                  }
                  ctx.closePath();
                  ctx.stroke();
                  
                  // Check if this box has an associated code
                  const boxCode = box.code || (this._lastCodes && this._lastCodes.length > 0 ? this._lastCodes[0] : null);
                  
                  if (boxCode) {
                    // Add background for text
                    const xs = box.map(pt => pt[0]);
                    const ys = box.map(pt => pt[1]);
                    const x0 = Math.min(...xs);
                    const y0 = Math.min(...ys);
                    
                    ctx.fillStyle = "rgba(0,0,0,0.7)";
                    ctx.fillRect(x0, y0 - 30, 200, 25);
                    
                    // Draw text
                    ctx.fillStyle = "rgba(0, 255, 0, 1)";
                    ctx.font = "bold 20px sans-serif";
                    ctx.fillText(boxCode, x0 + 5, y0 - 8);
                  }
                  
                  // Draw the box corners as dots
                  ctx.fillStyle = "white";
                  box.forEach(point => {
                    ctx.beginPath();
                    ctx.arc(point[0], point[1], 5, 0, 2 * Math.PI);
                    ctx.fill();
                  });
                }
              } catch (e) {
                console.error(`Error drawing box:`, e, box);
              }
            });
          }

        } catch (e) {
          console.error("Error in onProcessed:", e);
        }
      });

      window.Quagga.onDetected((data) => {
        try {
          console.log("Quagga detected barcode:", data);
          
          // Process detected codes
          let newCodes = [];
          
          // Handle different data formats
          if (Array.isArray(data)) {
            // Process array of detection results
            data.forEach(result => {
              if (result.codeResult && result.codeResult.code) {
                newCodes.push({
                  code: result.codeResult.code,
                  box: result.box || null,
                  confidence: result.codeResult.confidence || 0
                });
              }
            });
          } else if (data.codeResult) {
            // Process single detection result
            newCodes.push({
              code: data.codeResult.code,
              box: data.box || null,
              confidence: data.codeResult.confidence || 0
            });
          }
          
          // Filter out low confidence detections (optional)
          // newCodes = newCodes.filter(item => item.confidence > 0.1);
          
          // Only update codes if we have new ones
          if (newCodes.length > 0) {
            // Extract just the code strings for _lastCodes
            this._lastCodes = newCodes.map(item => item.code);
            console.log("All detected codes:", this._lastCodes);
            
            // Associate codes with boxes if possible
            if (this._lastBoxes && this._lastBoxes.length > 0) {
              // If we have exactly one box and one code, associate them
              if (this._lastBoxes.length === 1 && newCodes.length === 1) {
                this._lastBoxes[0].code = newCodes[0].code;
              }
              // If we have multiple boxes and codes, try to match them by position
              else if (newCodes.some(item => item.box)) {
                // For codes that have box information, match directly
                newCodes.forEach(codeItem => {
                  if (codeItem.box) {
                    // Find the closest box in _lastBoxes to this code's box
                    const codeCenter = this._getBoxCenter(codeItem.box);
                    let closestBox = null;
                    let closestDist = Infinity;
                    
                    this._lastBoxes.forEach(box => {
                      const boxCenter = this._getBoxCenter(box);
                      const dist = this._getDistance(codeCenter, boxCenter);
                      if (dist < closestDist) {
                        closestDist = dist;
                        closestBox = box;
                      }
                    });
                    
                    // Associate if we found a close enough box
                    if (closestBox && closestDist < 100) { // 100px threshold
                      closestBox.code = codeItem.code;
                    }
                  }
                });
                
                // For remaining boxes without codes, distribute remaining codes
                const unassignedBoxes = this._lastBoxes.filter(box => !box.code);
                const unassignedCodes = newCodes
                  .filter(codeItem => !this._lastBoxes.some(box => box.code === codeItem.code))
                  .map(item => item.code);
                
                unassignedBoxes.forEach((box, idx) => {
                  if (idx < unassignedCodes.length) {
                    box.code = unassignedCodes[idx];
                  }
                });
              }
              // If we can't match by position, just distribute codes to boxes
              else {
                this._lastBoxes.forEach((box, idx) => {
                  if (idx < this._lastCodes.length) {
                    box.code = this._lastCodes[idx];
                  }
                });
              }
            }
            
            // Visual feedback
            this.refs.quaggaModal.style.border = "4px solid lime";
            setTimeout(() => {
              this.refs.quaggaModal.style.border = "";
            }, 400);
          }
        } catch (e) {
          console.error("Error in onDetected:", e);
        }
      });
    } catch (e) {
      console.error("Error in _startQuaggaProcessing:", e);
    }
  }

  // Helper methods for box matching
  _getBoxCenter(box) {
    if (!box || !Array.isArray(box) || box.length < 4) return {x: 0, y: 0};
    
    let sumX = 0, sumY = 0;
    for (let i = 0; i < box.length; i++) {
      sumX += box[i][0];
      sumY += box[i][1];
    }
    return {
      x: sumX / box.length,
      y: sumY / box.length
    };
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
      this._smoothedBoxes = rawBoxes.map(b => b.slice());
      this._lostCounts = new Array(rawBoxes.length).fill(0);
      return;
    }

    const oldBoxes = this._smoothedBoxes;
    const oldLost = this._lostCounts || new Array(oldBoxes.length).fill(0);
    const newSmoothed = [];
    const newLost = [];

    const rawCentroids = rawBoxes.map(box => {
      const cx = (box[0][0] + box[1][0] + box[2][0] + box[3][0]) / 4;
      const cy = (box[0][1] + box[1][1] + box[2][1] + box[3][1]) / 4;
      return [cx, cy];
    });
    const oldCentroids = oldBoxes.map(box => {
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
        const newPoly = rawBox.map(pt => pt.slice());
        newSmoothed.push(newPoly);
        newLost.push(0);
      }
    });

    this._smoothedBoxes = newSmoothed;
    this._lostCounts = newLost;
  }

  _onOverlayClick(evt) {
    try {
      if (!this._lastBoxes || !this._lastBoxes.length || this._lastCodes.length === 0) {
        console.log("No boxes or codes available for click");
        return;
      }

      const overlay = this.refs.quaggaOverlay;
      const rect = overlay.getBoundingClientRect();

      // Calculate click position relative to the overlay
      const clickX = (evt.clientX - rect.left) * (overlay.width / rect.width);
      const clickY = (evt.clientY - rect.top) * (overlay.height / rect.height);
      
      console.log("Click at:", clickX, clickY);
      console.log("Available boxes:", this._lastBoxes);

      for (const poly of this._lastBoxes) {
        try {
          if (this._pointInPolygon(clickX, clickY, poly)) {
            console.log("Box clicked:", poly);
            // Use the code associated with this box, or the first code if none
            const codeToUse = poly.code || (this._lastCodes.length > 0 ? this._lastCodes[0] : "");
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
      
      console.log("No box was clicked");
    } catch (e) {
      console.error("Error in _onOverlayClick:", e);
    }
  }

  _pointInPolygon(x, y, poly) {
    try {
      if (!poly || !Array.isArray(poly) || poly.length < 3) {
        return false;
      }
      
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (!poly[i] || !poly[j] || !Array.isArray(poly[i]) || !Array.isArray(poly[j])) {
          continue;
        }
        
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        
        if (isNaN(xi) || isNaN(yi) || isNaN(xj) || isNaN(yj)) {
          continue;
        }
        
        const intersect =
          (yi > y) !== (yj > y) &&
          x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
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
      window.Quagga.offProcessed();
      window.Quagga.offDetected();
      window.Quagga.stop();
    } catch (e) {
      console.error("Error stopping Quagga:", e);
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
      container.innerHTML = '';
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
      this.refs.fileButton.removeEventListener("click", () => 
        this.refs.fileInput.click()
      );
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
}

import { Components } from "@formio/js";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
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
    this.errorMessage = "";
    this.codeReader = null;
    this.videoElement = null;
    this.scannerRunning = false;
    this.animationFrameId = null;
    this._isFrozen = false;
    this._frozenImageData = null;
    this._lastDetectedCode = null;
    this._lastBoxes = null; // Store detected barcode boxes
    this._lastCodes = []; // Store detected barcode values
  }

  init() {
    super.init();
    this.initZXing();
  }

  initZXing() {
    try {
      // Create a simple reader with default settings
      this.codeReader = new BrowserMultiFormatReader();
      console.log("ZXing initialized successfully");
    } catch (error) {
      console.error("Error initializing ZXing:", error);
      this.errorMessage = "Failed to initialize barcode scanner";
    }
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
        <div
          ref="scannerModal"
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
            <div style="position: absolute; top: 8px; right: 8px; z-index: 20; display: flex; gap: 5px;">
              <button
                ref="closeModal"
                style="
                  background: white;
                  border: none;
                  border-radius: 4px;
                  padding: 5px 10px;
                ">
                Close
              </button>
            </div>
            <div
              ref="scannerContainer"
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
              <canvas 
                ref="scannerOverlay" 
                style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  z-index: 10;
                  pointer-events: none;
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
      scannerModal: "single",
      scannerContainer: "single",
      scannerOverlay: "single",
      closeModal: "single",
    });

    if (this.dataValue) {
      this.refs.barcode.value = this.dataValue;
    }

    if (!this.component.disabled) {
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
      });

      this.refs.scanButton.addEventListener("click", () => {
        this.openScanner();
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
        this.closeScanner();
      });

      // Add click handler for the overlay to select barcodes
      this.refs.scannerOverlay.addEventListener("click", (event) => {
        this.handleOverlayClick(event);
      });
    }

    return attached;
  }

  async openScanner() {
    if (!this.codeReader) {
      console.error('ZXing not initialized');
      this.errorMessage = 'Barcode scanner not ready';
      this.redraw();
      return;
    }

    try {
      // Reset state
      this._lastBoxes = null;
      this._lastCodes = [];
      this._lastDetectedCode = null;
      
      // Show the modal
      this.refs.scannerModal.style.display = "flex";
      
      // Clear any previous content
      this.refs.scannerContainer.innerHTML = '';
      
      // Create the overlay canvas first
      const overlay = document.createElement('canvas');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '10';
      overlay.style.pointerEvents = 'auto';
      this.refs.scannerOverlay = overlay;
      this.refs.scannerContainer.appendChild(overlay);
      
      // Add click handler for the overlay
      overlay.addEventListener('click', (event) => {
        this.handleOverlayClick(event);
      });
      
      // Create a new video element with specific attributes for iOS
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('autoplay', 'true');
      this.videoElement.setAttribute('muted', 'true');
      this.videoElement.style.maxWidth = "100%";
      this.videoElement.style.height = "auto";
      this.refs.scannerContainer.appendChild(this.videoElement);
      
      // Add a close button
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.position = 'absolute';
      closeButton.style.top = '10px';
      closeButton.style.right = '10px';
      closeButton.style.zIndex = '20';
      closeButton.style.padding = '8px 16px';
      closeButton.style.backgroundColor = '#fff';
      closeButton.style.border = 'none';
      closeButton.style.borderRadius = '4px';
      closeButton.style.cursor = 'pointer';
      closeButton.addEventListener('click', () => this.closeScanner());
      this.refs.scannerContainer.appendChild(closeButton);
      
      // Set up animation frame for continuous drawing
      const updateOverlay = () => {
        if (this.scannerRunning && this._lastBoxes) {
          this.drawBoxes();
        }
        if (this.scannerRunning) {
          this.animationFrameId = requestAnimationFrame(updateOverlay);
        }
      };
      
      // Start the animation loop
      this.scannerRunning = true;
      this.animationFrameId = requestAnimationFrame(updateOverlay);
      
      // Add a scanning indicator
      const scanningDiv = document.createElement('div');
      scanningDiv.style.position = 'absolute';
      scanningDiv.style.bottom = '10px';
      scanningDiv.style.left = '50%';
      scanningDiv.style.transform = 'translateX(-50%)';
      scanningDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
      scanningDiv.style.color = 'white';
      scanningDiv.style.padding = '10px';
      scanningDiv.style.borderRadius = '5px';
      scanningDiv.style.zIndex = '100';
      scanningDiv.textContent = 'Scanning...';
      this.refs.scannerContainer.appendChild(scanningDiv);
      
      // Use ZXing's built-in method to start the camera and decode continuously
      this.codeReader.decodeFromVideoDevice(
        undefined, // Use default camera
        this.videoElement,
        (result, error) => {
          if (result) {
            console.log('Barcode detected:', result.getText());
            
            // Get the result points (corners of the barcode)
            const resultPoints = result.getResultPoints();
            
            if (resultPoints && resultPoints.length > 0) {
              // Create a box from the result points
              const box = resultPoints.map(point => [point.getX(), point.getY()]);
              
              // Add the code to the box
              box.code = result.getText();
              box.format = result.getBarcodeFormat().toString();
              
              // Store the box for drawing
              this._lastBoxes = [box];
              
              // Store the code
              this._lastCodes = [result.getText()];
              
              // If no code is selected yet, select this one
              if (!this._lastDetectedCode) {
                this._lastDetectedCode = result.getText();
                this.refs.barcode.value = result.getText();
                this.updateValue(result.getText());
                
                // Visual feedback for first detection
                this.refs.scannerModal.style.border = "4px solid lime";
                setTimeout(() => {
                  this.refs.scannerModal.style.border = "";
                }, 400);
              } else if (this._lastDetectedCode !== result.getText()) {
                // Only update if it's a different code
                this._lastDetectedCode = result.getText();
                this.refs.barcode.value = result.getText();
                this.updateValue(result.getText());
                
                // Visual feedback for new code
                this.refs.scannerModal.style.border = "4px solid yellow";
                setTimeout(() => {
                  this.refs.scannerModal.style.border = "";
                }, 200);
              }
            }
          }
          
          if (error && !(error.name === 'NotFoundException' || error.message === 'No barcode found')) {
            console.error('Error during scan:', error);
          }
        }
      );
    } catch (error) {
      console.error('Error opening scanner:', error);
      this.errorMessage = 'Failed to open camera';
      this.redraw();
    }
  }

  drawBoxes() {
    if (!this._lastBoxes || !this.refs.scannerOverlay) return;
    
    const overlay = this.refs.scannerOverlay;
    const ctx = overlay.getContext('2d');
    
    // Get dimensions
    let width, height;
    if (this.videoElement) {
      width = this.videoElement.videoWidth;
      height = this.videoElement.videoHeight;
      
      // If video dimensions aren't available yet, try again later
      if (width === 0 || height === 0) {
        return;
      }
    } else {
      // For image processing
      const img = this.refs.scannerContainer.querySelector('img');
      if (img) {
        width = img.naturalWidth;
        height = img.naturalHeight;
      } else {
        return; // No dimensions available
      }
    }
    
    // Only update canvas dimensions if they've changed or not set
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
      console.log('Canvas dimensions set to:', width, height);
    }
    
    // Clear the canvas
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    // Draw each box with thicker lines for better visibility
    this._lastBoxes.forEach((box) => {
      // Convert 2-point box to 4-point rectangle if needed
      let points = box;
      if (box.length === 2) {
        // We have two points, create a rectangle
        const [x1, y1] = box[0];
        const [x2, y2] = box[1];
        
        // Create a rectangle using the two points as opposite corners
        points = [
          [x1, y1],  // Top-left
          [x2, y1],  // Top-right
          [x2, y2],  // Bottom-right
          [x1, y2]   // Bottom-left
        ];
        
        // Store the code and format
        points.code = box.code;
        points.format = box.format;
        
        console.log('Converted 2-point box to rectangle:', points);
      } else if (box.length < 3) {
        console.log('Box has fewer than 2 points, cannot draw:', box);
        return;
      }
      
      // Draw the polygon
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.closePath();
      
      // Style based on whether this is the selected code
      if (this._lastDetectedCode === points.code) {
        ctx.strokeStyle = '#00ff00'; // Green for selected
        ctx.lineWidth = 6;
      } else {
        ctx.strokeStyle = '#ffff00'; // Yellow for unselected
        ctx.lineWidth = 4;
      }
      
      ctx.stroke();
      
      // Add a more visible label with the barcode value
      if (points.code) {
        ctx.font = 'bold 16px Arial';
        const textWidth = ctx.measureText(points.code).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(points[0][0], points[0][1] - 30, textWidth + 20, 25);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(points.code, points[0][0] + 10, points[0][1] - 10);
      }
    });
  }

  handleOverlayClick(event) {
    if (!this._lastBoxes || !this.refs.scannerOverlay) return;
    
    // Get the click coordinates relative to the overlay
    const overlay = this.refs.scannerOverlay;
    const rect = overlay.getBoundingClientRect();
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    // Check if the click is inside any of the boxes
    for (const box of this._lastBoxes) {
      // Convert 2-point box to 4-point rectangle if needed
      let points = box;
      if (box.length === 2) {
        const [x1, y1] = box[0];
        const [x2, y2] = box[1];
        points = [
          [x1, y1], [x2, y1], [x2, y2], [x1, y2]
        ];
      }
      
      if (this.isPointInPolygon(x, y, points)) {
        // Update the input field with the selected barcode
        this.refs.barcode.value = box.code;
        this.updateValue(box.code);
        
        // Store the selected code
        this._lastDetectedCode = box.code;
        
        // Visual feedback
        this.refs.scannerModal.style.border = "4px solid lime";
        setTimeout(() => {
          this.refs.scannerModal.style.border = "";
        }, 400);
        
        break;
      }
    }
  }

  isPointInPolygon(x, y, polygon) {
    // Ray casting algorithm to determine if a point is inside a polygon
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y)) && 
                        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  async processImageFile(file) {
    if (!this.codeReader) {
      console.error('ZXing not initialized');
      this.errorMessage = 'Barcode scanner not ready';
      this.redraw();
      return;
    }
    
    try {
      // Reset state
      this._lastBoxes = null;
      this._lastCodes = [];
      
      // Show the modal
      this.refs.scannerModal.style.display = "flex";
      
      // Clear any previous content
      this.refs.scannerContainer.innerHTML = '';
      
      // Create the overlay canvas first
      const overlay = document.createElement('canvas');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '10';
      overlay.style.pointerEvents = 'auto';
      this.refs.scannerOverlay = overlay;
      this.refs.scannerContainer.appendChild(overlay);
      
      // Add click handler for the overlay
      overlay.addEventListener('click', (event) => {
        this.handleOverlayClick(event);
      });
      
      // Add a loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.style.position = 'absolute';
      loadingDiv.style.top = '50%';
      loadingDiv.style.left = '50%';
      loadingDiv.style.transform = 'translate(-50%, -50%)';
      loadingDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
      loadingDiv.style.color = 'white';
      loadingDiv.style.padding = '10px';
      loadingDiv.style.borderRadius = '5px';
      loadingDiv.style.zIndex = '100';
      loadingDiv.textContent = 'Processing image...';
      this.refs.scannerContainer.appendChild(loadingDiv);
      
      // Create a file reader to get the image data
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Create an image element
          const img = new Image();
          img.onload = async () => {
            try {
              // Remove loading indicator
              if (this.refs.scannerContainer.contains(loadingDiv)) {
                this.refs.scannerContainer.removeChild(loadingDiv);
              }
              
              // Create a canvas to draw the image
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              // Display the image
              img.style.maxWidth = "100%";
              img.style.height = "auto";
              this.refs.scannerContainer.appendChild(img);
              
              // Process with ZXing
              try {
                const result = await this.codeReader.decodeFromCanvas(canvas);
                
                if (result) {
                  console.log('Barcode detected:', result.getText());
                  
                  // Get the result points (corners of the barcode)
                  const resultPoints = result.getResultPoints();
                  
                  if (resultPoints && resultPoints.length > 0) {
                    // Create a box from the result points
                    const box = resultPoints.map(point => [point.getX(), point.getY()]);
                    
                    // Add the code to the box
                    box.code = result.getText();
                    box.format = result.getBarcodeFormat().toString();
                    
                    // Store the box for drawing
                    this._lastBoxes = [box];
                    
                    // Store the code
                    this._lastCodes = [result.getText()];
                    
                    // Update the input field
                    this.refs.barcode.value = result.getText();
                    this.updateValue(result.getText());
                    
                    // Store the selected code
                    this._lastDetectedCode = result.getText();
                    
                    // Draw the box
                    this.drawBoxes();
                    
                    // Visual feedback
                    this.refs.scannerModal.style.border = "4px solid lime";
                    setTimeout(() => {
                      this.refs.scannerModal.style.border = "";
                    }, 400);
                  }
                }
              } catch (error) {
                // No barcode found
                const errorDiv = document.createElement('div');
                errorDiv.style.position = 'absolute';
                errorDiv.style.top = '50%';
                errorDiv.style.left = '50%';
                errorDiv.style.transform = 'translate(-50%, -50%)';
                errorDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
                errorDiv.style.color = 'red';
                errorDiv.style.padding = '10px';
                errorDiv.style.borderRadius = '5px';
                errorDiv.textContent = 'No barcode detected';
                this.refs.scannerContainer.appendChild(errorDiv);
                
                console.error('Error decoding image:', error);
              }
            } catch (error) {
              console.error('Error processing image:', error);
            }
          };
          img.src = e.target.result;
        } catch (error) {
          console.error('Error loading image:', error);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing file:', error);
      this.errorMessage = 'Failed to process image';
      this.redraw();
    }
  }

  closeScanner() {
    try {
      // Stop scanning
      if (this.codeReader) {
        this.codeReader.reset();
      }
      
      // Cancel animation frame if active
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      
      this.scannerRunning = false;
      
      // Hide modal
      this.refs.scannerModal.style.display = "none";
      
      // Clear the overlay
      if (this.refs.scannerOverlay) {
        const ctx = this.refs.scannerOverlay.getContext('2d');
        ctx.clearRect(0, 0, this.refs.scannerOverlay.width, this.refs.scannerOverlay.height);
      }
      
      // Reset state
      this._isFrozen = false;
      this._frozenImageData = null;
      this._lastBoxes = null;
      this._lastCodes = [];
    } catch (error) {
      console.error('Error closing scanner:', error);
    }
  }

  destroy() {
    this.closeScanner();
    return super.destroy();
  }

  setValue(value, flags = {}) {
    super.setValue(value, flags);
    if (this.refs.barcode) {
      this.refs.barcode.value = value || "";
    }
  }
}

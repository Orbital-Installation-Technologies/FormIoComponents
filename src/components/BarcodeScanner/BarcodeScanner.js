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
      // Show the modal
      this.refs.scannerModal.style.display = "flex";
      
      // Clear any previous content
      this.refs.scannerContainer.innerHTML = '';
      
      // Create a new video element with specific attributes for iOS
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('autoplay', 'true');
      this.videoElement.setAttribute('muted', 'true');
      this.videoElement.style.maxWidth = "100%";
      this.videoElement.style.height = "auto";
      this.refs.scannerContainer.appendChild(this.videoElement);
      
      // Set hints to improve detection of linear barcodes
      const hints = new Map();
      
      // Use ZXing's built-in method to start the camera and decode continuously
      this.codeReader.decodeFromVideoDevice(
        undefined, // Use default camera
        this.videoElement,
        (result, error) => {
          if (result) {
            console.log('Barcode detected:', result.getText());
            
            // Update the input field
            this.refs.barcode.value = result.getText();
            this.updateValue(result.getText());
            
            // Visual feedback
            this.refs.scannerModal.style.border = "4px solid lime";
            setTimeout(() => {
              this.refs.scannerModal.style.border = "";
            }, 400);
            
            // Store the last detected code
            this._lastDetectedCode = result.getText();
            
            // Add a success message
            const successDiv = document.createElement('div');
            successDiv.style.position = 'absolute';
            successDiv.style.top = '10px';
            successDiv.style.left = '50%';
            successDiv.style.transform = 'translateX(-50%)';
            successDiv.style.backgroundColor = 'rgba(0,255,0,0.7)';
            successDiv.style.color = 'white';
            successDiv.style.padding = '10px';
            successDiv.style.borderRadius = '5px';
            successDiv.style.zIndex = '100';
            successDiv.textContent = `Detected: ${result.getText()}`;
            this.refs.scannerContainer.appendChild(successDiv);
            
            // Remove the success message after 2 seconds
            setTimeout(() => {
              if (this.refs.scannerContainer.contains(successDiv)) {
                this.refs.scannerContainer.removeChild(successDiv);
              }
            }, 2000);
          }
          
          if (error && !(error.name === 'NotFoundException' || error.message === 'No barcode found')) {
            console.error('Error during scan:', error);
          }
        }
      );
      
      this.scannerRunning = true;
      
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
    } catch (error) {
      console.error('Error opening scanner:', error);
      this.errorMessage = 'Failed to open camera';
      this.redraw();
    }
  }

  closeScanner() {
    try {
      // Stop scanning
      if (this.codeReader) {
        this.codeReader.reset();
      }
      
      this.scannerRunning = false;
      
      // Hide modal
      this.refs.scannerModal.style.display = "none";
      
      // Clear the container
      this.refs.scannerContainer.innerHTML = '';
      
      // Reset state
      this._isFrozen = false;
      this._frozenImageData = null;
    } catch (error) {
      console.error('Error closing scanner:', error);
    }
  }

  async processImageFile(file) {
    if (!this.codeReader) {
      console.error('ZXing not initialized');
      this.errorMessage = 'Barcode scanner not ready';
      this.redraw();
      return;
    }
    
    try {
      // Show the modal
      this.refs.scannerModal.style.display = "flex";
      
      // Clear any previous content
      this.refs.scannerContainer.innerHTML = '';
      
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
                // Try to decode from the canvas first (more reliable)
                const result = await this.codeReader.decodeFromCanvas(canvas);
                
                if (result) {
                  console.log('Barcode detected:', result.getText());
                  
                  // Update the input field
                  this.refs.barcode.value = result.getText();
                  this.updateValue(result.getText());
                  
                  // Visual feedback
                  this.refs.scannerModal.style.border = "4px solid lime";
                  setTimeout(() => {
                    this.refs.scannerModal.style.border = "";
                  }, 400);
                  
                  // Add a success message
                  const successDiv = document.createElement('div');
                  successDiv.style.position = 'absolute';
                  successDiv.style.top = '10px';
                  successDiv.style.left = '50%';
                  successDiv.style.transform = 'translateX(-50%)';
                  successDiv.style.backgroundColor = 'rgba(0,255,0,0.7)';
                  successDiv.style.color = 'white';
                  successDiv.style.padding = '10px';
                  successDiv.style.borderRadius = '5px';
                  successDiv.style.zIndex = '100';
                  successDiv.textContent = `Detected: ${result.getText()}`;
                  this.refs.scannerContainer.appendChild(successDiv);
                }
              } catch (error) {
                // If canvas decoding fails, try with the image directly
                try {
                  const result = await this.codeReader.decodeFromImage(img);
                  
                  if (result) {
                    console.log('Barcode detected from image:', result.getText());
                    
                    // Update the input field
                    this.refs.barcode.value = result.getText();
                    this.updateValue(result.getText());
                    
                    // Visual feedback
                    this.refs.scannerModal.style.border = "4px solid lime";
                    setTimeout(() => {
                      this.refs.scannerModal.style.border = "";
                    }, 400);
                    
                    // Add a success message
                    const successDiv = document.createElement('div');
                    successDiv.style.position = 'absolute';
                    successDiv.style.top = '10px';
                    successDiv.style.left = '50%';
                    successDiv.style.transform = 'translateX(-50%)';
                    successDiv.style.backgroundColor = 'rgba(0,255,0,0.7)';
                    successDiv.style.color = 'white';
                    successDiv.style.padding = '10px';
                    successDiv.style.borderRadius = '5px';
                    successDiv.style.zIndex = '100';
                    successDiv.textContent = `Detected: ${result.getText()}`;
                    this.refs.scannerContainer.appendChild(successDiv);
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

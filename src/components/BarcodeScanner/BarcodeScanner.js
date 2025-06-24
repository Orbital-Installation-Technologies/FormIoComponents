import { Components } from "@formio/js";
import BarcodeScannerEditForm from "./BarcodeScanner.form";
import {
  BarcodeCaptureSettings,
  BarcodeCapture,
  Symbology,
  barcodeCaptureLoader,
  BarcodeTracking,
  BarcodeTrackingSettings
} from "@scandit/web-datacapture-barcode";
import {
  DataCaptureView,
  DataCaptureContext,
  FrameSourceState,
  Camera,
  configure
} from "@scandit/web-datacapture-core";

const FieldComponent = Components.components.field;

// Global flag to track if Scandit has been configured
let scanditConfigured = false;





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
    this._lastCodes = [];
    this._currentBarcodes = [];
    this._isVideoFrozen = false;
    this._dataCaptureContext = null;
    this._barcodeCapture = null;
    this._camera = null;
    this._dataCaptureView = null;
    this._drawingPending = false;
    
    // License key for Scandit
    this._licenseKey = "Av8GN2+eSVonBPcwmMJJB3INUu9TRPN5u0Grz34h7shTbBFjBW4vSCxFPgVyeShmblQbx50lOAgsa45NqFzQpWMVu3YTZZKBwDft++BuYhMjRaMrAhDyRPwLncPPYf2s+nQo8yd+S4t1V6zhjRuqx0BJ0JXyFYeYhHubaWIVUJIwXSauaGR369dLw+fiZmNF6GjXExlTUI40aM4Oi2NyDD1dnL3ASdNo43U67g5XrA79biccYk8rVAZdbEO4RzOIHU+P9zdr/zXNY2Za4E/3o8Zs6c0Ge27KYxZZt6h55trZIiqPon2b3mxiJyBeZVGehXqknVtorReOedJ9P06qzMlHb5RIEf41jkdeLoFaRuFmXK2981M7A1pssNR5ZBcue3zaEXR1KWyQUJWHs1RdudErSTboXfX/K2Gm8X5rNW3Ef4MGpn+ArGlznVmcUk5jp3hxKQVCnpmTUxG82WDkI8lubfnmLgthFHvRep5TeO4BZ9zduERwdt1zkYXmZLwoRUq+CtRhK7KrXDyHZkBrtTgzx6Wmn/FPXXP+/h4Cuhrs5dGRML19Tea51F63+EQ91USoQC2M0HkIse1NgUwUXjfGDM2P2EFl9hCM+syYLOuyN966CE+0Ie+rYld+pAC/2AXerR148Zo5RntvNIr+Nb+09fG6wA2ZkLSpsCNh/fiaUUfa0OBV2rmBe+5MAYIj2Bj2xO2/urZy+vvJaue9yUdA+J+5MTdzE6WilYgPZWOL4hs4natnI7727wo/j9WLvBdGFFCnV5+I4tJZcLDUAlUJNHIQoOlhQoBWECFmTgRY37dHVQ7qQMMxL3/d6CiccOLqRCsF9EKpe15zCvSY97eXtoTBVCPe6vV8JbMZhNPH+I7mdM9dYhWZJuL7PlXOtmJBNE4AOMwMQnqea6ptkR1XaDto9SMLshjLaKjTVTMT8uK102AbzWIsMkruvSYdaE/FIPQ5dqlxlTB6UhFk9o+7iOuyM1J5XtJO54gi8TafoiIV9xu1oNx7SmnZiF7hAMXUnKVOOXQn8kLLfDqWbUpAx8I8Z7kP9AZ6TRNpk26equ6hn7npqkzKF7hNieqyVjRItOBeU3DE/hcfu3qy+i3vD7QjvgON1qglM2UVp6fUjpX74YvhqGvlhiwm0ItgQSLwZRuFZOAEdYh4aiSgAv3r/TNua3alkoR6J70TAW8hqP1mWChSAieZmTrdUr3nY/4=";
  }

  init() {
    super.init();
  }

  render() {
    // Camera icon SVG
    const cameraSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" fill="currentColor">
      <path d="M149.1 64.8L138.7 96H64C28.7 96 0 124.7 0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H373.3L362.9 64.8C356.4 45.2 338.1 32 317.4 32H194.6c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/>
    </svg>`;

    // File image icon SVG
    const fileImageSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16" height="16" fill="currentColor">
      <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM64 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm152 32c5.3 0 10.2 2.6 13.2 6.9l88 128c3.4 4.9 3.7 11.3 1 16.5s-8.2 8.6-14.2 8.6H216 176 128 80c-5.8 0-11.1-3.1-13.9-8.1s-2.8-11.2 .2-16.1l48-80c2.9-4.8 8.1-7.8 13.7-7.8s10.8 2.9 13.7 7.8l12.8 21.4 48.3-70.2c3-4.3 7.9-6.9 13.2-6.9z"/>
    </svg>`;



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
        <div ref="quaggaModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; flex-direction:column; align-items:center; justify-content:center;">
          <div style="position:relative; width:90%; max-width:640px; height:80%; max-height:480px; background:black; border-radius:8px; overflow:hidden;">
            <button ref="closeModal" style="position:absolute; top:10px; right:10px; z-index:1001; background:rgba(255,255,255,0.8); border:none; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer;">×</button>

            
            <!-- Container for Scandit's DataCaptureView -->
            <div
              ref="scanditContainer"
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
          
          <!-- Freeze/capture button -->
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
      scanditContainer: "single",
      closeModal: "single",
      freezeButton: "single",
    });

    if (
      !this.refs.barcode ||
      !this.refs.scanButton ||
      !this.refs.fileButton ||
      !this.refs.fileInput ||
      !this.refs.quaggaModal ||
      !this.refs.scanditContainer ||
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
        this.openScanditModal();
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
        this.stopScanner();
        this._lastCodes = [];
        this._isVideoFrozen = false;
      });

      // Add freeze button event listener
      this.refs.freezeButton.addEventListener("click", () => {
        this._toggleFreezeVideo();
      });

    }

    return attached;
  }

  detach() {
    return super.detach();
  }

  async processImageFile(file) {
    try {
      const imageData = await this._fileToImageData(file);
      this.scanImageWithScandit(imageData);
    } catch (error) {
      console.error("Error processing image file:", error);
      this.errorMessage = "Failed to process image file";
    }
  }

  async _fileToImageData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve(img);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async scanImageWithScandit(_imageSource) {
    try {
      // For now, let's use a simpler approach and show an error message
      // The Scandit Web SDK doesn't have a straightforward way to process
      // arbitrary image files directly. The SingleImageUploader is designed
      // to present its own UI for image selection.
      this.errorMessage = "Image file processing not yet implemented with Scandit SDK";
      setTimeout(() => {
        this.errorMessage = "";
        this.redraw();
      }, 3000);
    } catch (error) {
      console.error("Error scanning image with Scandit:", error);
      this.errorMessage = "Failed to scan image";
      setTimeout(() => {
        this.errorMessage = "";
        this.redraw();
      }, 3000);
    }
  }

  async _initializeScandit() {
    try {
      // Configure Scandit SDK if not already configured
      if (!scanditConfigured) {
        await configure({
          licenseKey: this._licenseKey,
          // Use CDN for now since serving sdc-lib files requires special webpack configuration
          libraryLocation: "https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-barcode@7.4.0/sdc-lib/",
          moduleLoaders: [barcodeCaptureLoader()]
        });
        scanditConfigured = true;
      }

      // Create data capture context
      this._dataCaptureContext = await DataCaptureContext.create();
      
      // Configure barcode capture settings for continuous tracking
      const settings = new BarcodeCaptureSettings();

      // Enable common symbologies (using the exact names from Scandit documentation)
      try {
        settings.enableSymbologies([
          Symbology.Code128,
          Symbology.Code39,
          Symbology.QR,
          Symbology.EAN8,
          Symbology.UPCE,
          Symbology.EAN13UPCA,
          Symbology.DataMatrix
        ]);
        console.log("Symbologies enabled successfully");
      } catch (symbologyError) {
        console.error("Error enabling symbologies:", symbologyError);
        throw symbologyError;
      }

      // Configure for continuous tracking
      try {
        // Enable continuous scanning without stopping after detection
        settings.codeDuplicateFilter = 0; // Allow immediate re-detection of same codes

        // Set location selection to maximize tracking area
        if (settings.locationSelection) {
          settings.locationSelection = null; // Use full camera view
        }

        console.log("Continuous tracking settings applied");
      } catch (settingsError) {
        console.warn("Some tracking settings not available:", settingsError);
      }
      
      // Create barcode capture instance
      try {
        console.log("Creating BarcodeCapture with context:", this._dataCaptureContext);
        this._barcodeCapture = await BarcodeCapture.forContext(this._dataCaptureContext, settings);
        console.log("BarcodeCapture created successfully:", this._barcodeCapture);
      } catch (captureError) {
        console.error("Error creating BarcodeCapture:", captureError);
        throw captureError;
      }
      
      // Setup barcode capture listener
      this._barcodeCapture.addListener({
        didUpdateSession: (_, session) => {
          // This is called for every frame, allowing continuous tracking
          try {
            if (!session) return;

            // Update last barcode time to keep tracking active
            this._lastBarcodeTime = Date.now();

            // Get ALL tracked barcodes from the session
            const trackedBarcodes = session.trackedBarcodes || new Map();
            const allVisibleBarcodes = Array.from(trackedBarcodes.values());

            console.log("didUpdateSession - tracked barcodes:", trackedBarcodes.size, "visible:", allVisibleBarcodes.length);

            if (allVisibleBarcodes.length > 0) {
              // Extract the actual barcode objects from tracked barcodes
              const barcodeObjects = allVisibleBarcodes.map(tracked => tracked.barcode).filter(b => b);
              console.log("Extracted barcode objects:", barcodeObjects.length);

              // Log details of each barcode for debugging
              barcodeObjects.forEach((barcode, index) => {
                console.log(`Barcode ${index}: ${barcode.data} at location:`, barcode.location);
              });

              if (barcodeObjects.length > 0) {
                this._drawBoundingBoxes(barcodeObjects);
                return; // Don't clear if we have barcodes
              }
            }

            // Also check for newly recognized barcodes as fallback
            const newlyRecognizedBarcodes = session.newlyRecognizedBarcodes || [];
            if (newlyRecognizedBarcodes.length > 0) {
              console.log("Using newly recognized barcodes:", newlyRecognizedBarcodes.length);
              this._drawBoundingBoxes(newlyRecognizedBarcodes);
              return;
            }

            // Try to get all barcodes from the session in different ways
            if (session.newlyRecognizedBarcode) {
              console.log("Using single newly recognized barcode");
              this._drawBoundingBoxes([session.newlyRecognizedBarcode]);
              return;
            }

            // Don't clear bounding boxes automatically - let them persist for continuous tracking
            // Only clear if we haven't had any barcode activity for a longer time
            if (!this._lastBarcodeTime || Date.now() - this._lastBarcodeTime > 1000) {
              this._clearBoundingBoxes();
            }
          } catch (error) {
            console.warn("Error in didUpdateSession:", error);
          }
        },
        didScan: (_, session) => {
          try {
            // Check if session exists
            if (!session) {
              console.warn("Invalid session");
              return;
            }

            const newlyRecognized = session.newlyRecognizedBarcode;

            if (newlyRecognized) {
              // Log barcode value to console
              console.log("Barcode detected:", newlyRecognized.data);
              console.log("Barcode location:", newlyRecognized.location);

              // Try drawing the newly recognized barcode immediately
              if (newlyRecognized.location) {
                console.log("Drawing newly recognized barcode");
                this._drawBoundingBoxes([newlyRecognized]);
              }

              // Store detected barcode for potential selection (avoid duplicates)
              const existingCode = this._lastCodes.find(c => c.code === newlyRecognized.data);
              if (!existingCode) {
                this._lastCodes.push({
                  code: newlyRecognized.data,
                  format: newlyRecognized.symbology
                });
              }

              // Show brief visual feedback for newly detected barcodes
              if (this.refs.quaggaModal) {
                this.refs.quaggaModal.style.border = "4px solid lime";
                setTimeout(() => {
                  if (this.refs.quaggaModal) {
                    this.refs.quaggaModal.style.border = "";
                  }
                }, 200);
              }
            }

            // Don't draw bounding boxes here - let didUpdateSession handle all drawing
            // This prevents conflicts between the two callbacks

          } catch (error) {
            console.error("Error in didScan callback:", error);
          }
        }
      });
      
      // Create data capture view
      this._dataCaptureView = await DataCaptureView.forContext(this._dataCaptureContext);

      // Connect barcode capture to view
      this._dataCaptureView.connectToElement(this.refs.scanditContainer);

      // Create bounding box overlay
      this._createBoundingBoxOverlay();

      // Start continuous bounding box clearing for live scanning
      this._startLiveScanningMode();

      // Start aggressive continuous tracking
      this._startContinuousTracking();
    } catch (error) {
      console.error("Error initializing Scandit:", error);
      this.errorMessage = "Failed to initialize barcode scanner";
    }
  }

  async openScanditModal() {
    this.refs.quaggaModal.style.display = "flex";
    this._lastCodes = [];
    this._isVideoFrozen = false;

    // Reset freeze button
    this.refs.freezeButton.innerHTML = '<i class="fa fa-camera" style="font-size: 24px;"></i>';
    this.refs.freezeButton.style.background = "rgba(255,255,255,0.8)";
    this.refs.freezeButton.style.display = "flex"; // Ensure button is visible

    try {
      // Initialize Scandit if not already done
      if (!this._dataCaptureContext) {
        await this._initializeScandit();
      }

      // Setup camera
      await this._setupCamera();
    } catch (error) {
      console.error("Error opening Scandit modal:", error);
      this.errorMessage = "Failed to initialize scanner";
      this.refs.quaggaModal.style.display = "none";
    }
  }
  
  async _setupCamera() {
    try {
      // Get recommended camera settings for barcode capture
      const cameraSettings = BarcodeCapture.recommendedCameraSettings;

      // Get camera
      this._camera = Camera.default;
      if (this._camera) {
        // Set camera settings
        await this._camera.applySettings(cameraSettings);

        // Set camera as frame source
        await this._dataCaptureContext.setFrameSource(this._camera);

        // Switch camera on
        await this._camera.switchToDesiredState(FrameSourceState.On);

        // Start scanning
        if (this._barcodeCapture) {
          await this._barcodeCapture.setEnabled(true);
        } else {
          throw new Error("BarcodeCapture instance is null");
        }
      } else {
        console.error("No camera available");
        this.errorMessage = "No camera available";
      }
    } catch (error) {
      console.error("Error setting up camera:", error);
      this.errorMessage = "Failed to access camera";
      
      // Show error in the container
      this.refs.scanditContainer.innerHTML = `
        <div style="
          color: white;
          text-align: center;
          padding: 20px;
          font-size: 1rem;
        ">
          🚫 Camera failed to start:<br>
          ${error.name || error.message}
        </div>`;
    }
  }

  _showBarcodeSelectionUI() {
    if (this._lastCodes.length === 0) return;
    
    // Create selection UI
    const selectionUI = document.createElement("div");
    selectionUI.style.position = "absolute";
    selectionUI.style.top = "50%";
    selectionUI.style.left = "50%";
    selectionUI.style.transform = "translate(-50%, -50%)";
    selectionUI.style.background = "white";
    selectionUI.style.padding = "20px";
    selectionUI.style.borderRadius = "8px";
    selectionUI.style.zIndex = "1002";
    selectionUI.style.display = "flex";
    selectionUI.style.flexDirection = "column";
    selectionUI.style.alignItems = "center";
    
    // Add title
    const title = document.createElement("div");
    title.textContent = "Select a barcode:";
    title.style.marginBottom = "10px";
    title.style.fontWeight = "bold";
    selectionUI.appendChild(title);
    
    // Add buttons for each code
    this._lastCodes.forEach((codeInfo) => {
      const button = document.createElement("button");
      button.textContent = `${codeInfo.code} (${codeInfo.format})`;
      button.style.margin = "5px";
      button.style.padding = "8px 12px";
      button.style.border = "none";
      button.style.borderRadius = "4px";
      button.style.background = "#4CAF50";
      button.style.color = "white";
      button.style.cursor = "pointer";
      
      button.addEventListener("click", () => {
        this.updateValue(codeInfo.code);
        this.refs.barcode.value = codeInfo.code;
        this.stopScanner();
        this._lastCodes = [];

        // Remove selection UI
        if (selectionUI.parentNode) {
          selectionUI.parentNode.removeChild(selectionUI);
        }
      });
      
      selectionUI.appendChild(button);
    });
    
    // Add to modal
    this.refs.quaggaModal.appendChild(selectionUI);
  }

  _toggleFreezeVideo() {
    try {
      this._isVideoFrozen = !this._isVideoFrozen;
      
      // Update button appearance
      if (this._isVideoFrozen) {
        this.refs.freezeButton.innerHTML = '<i class="fa fa-play" style="font-size: 24px;"></i>';
        this.refs.freezeButton.style.background = "rgba(0,255,0,0.8)";
        
        // Pause camera
        if (this._camera) {
          this._camera.switchToDesiredState(FrameSourceState.Off);
        }
        
        // If we have detected codes, show selection UI
        if (this._lastCodes.length > 0) {
          this._showBarcodeSelectionUI();
        }
      } else {
        this.refs.freezeButton.innerHTML = '<i class="fa fa-camera" style="font-size: 24px;"></i>';
        this.refs.freezeButton.style.background = "rgba(255,255,255,0.8)";
        
        // Resume camera
        if (this._camera) {
          this._camera.switchToDesiredState(FrameSourceState.On);
        }
        
        // Remove any selection UI
        const selectionUI = this.refs.quaggaModal.querySelector("div[style*='z-index: 1002']");
        if (selectionUI) {
          selectionUI.parentNode.removeChild(selectionUI);
        }
      }
    } catch (e) {
      console.error("Error toggling video freeze:", e);
    }
  }












  async stopScanner() {
    try {
      if (this._camera) {
        await this._camera.switchToDesiredState(FrameSourceState.Off);
      }

      if (this._barcodeCapture) {
        await this._barcodeCapture.setEnabled(false);
      }

      // Stop live scanning mode
      this._stopLiveScanningMode();

      // Stop continuous tracking
      this._stopContinuousTracking();

      // Clear bounding boxes
      this._clearBoundingBoxes();

      // Properly close the modal
      if (this.refs.quaggaModal) {
        setTimeout(() => {
          //this.refs.quaggaModal.style.display = "none";
        }, 500);
      }

      this._isVideoFrozen = false;
    } catch (e) {
      console.error("Error stopping scanner:", e);
    }
  }

  _createBoundingBoxOverlay() {
    // Create overlay canvas for bounding boxes
    this._boundingBoxCanvas = document.createElement('canvas');
    this._boundingBoxCanvas.style.position = 'absolute';
    this._boundingBoxCanvas.style.top = '0';
    this._boundingBoxCanvas.style.left = '0';
    this._boundingBoxCanvas.style.width = '100%';
    this._boundingBoxCanvas.style.height = '100%';
    this._boundingBoxCanvas.style.pointerEvents = 'auto'; // Enable clicks
    this._boundingBoxCanvas.style.zIndex = '1000';
    this._boundingBoxCanvas.style.cursor = 'pointer';

    this._boundingBoxContext = this._boundingBoxCanvas.getContext('2d');

    // Add canvas to the scandit container
    this.refs.scanditContainer.appendChild(this._boundingBoxCanvas);

    // Add click handler for bounding box selection
    this._boundingBoxCanvas.addEventListener('click', (event) => {
      this._handleBoundingBoxClick(event);
    });

    // Use simple event-based approach for resize handling
    this._resizeHandler = () => {
      if (this._boundingBoxCanvas) {
        requestAnimationFrame(() => this._resizeBoundingBoxCanvas());
      }
    };

    // Add event listeners for various size change scenarios
    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('orientationchange', this._resizeHandler);

    // Initial sizing
    this._resizeBoundingBoxCanvas();

    // Test canvas by drawing a small test rectangle
    setTimeout(() => {
      if (this._boundingBoxContext) {
        console.log("Drawing test rectangle on canvas");
        this._boundingBoxContext.strokeStyle = 'red';
        this._boundingBoxContext.lineWidth = 2;
        this._boundingBoxContext.strokeRect(10, 10, 100, 50);
        this._boundingBoxContext.fillStyle = 'rgba(255, 0, 0, 0.3)';
        this._boundingBoxContext.fillRect(10, 10, 100, 50);

        // Clear test rectangle after 3 seconds
        setTimeout(() => {
          if (this._boundingBoxContext) {
            this._boundingBoxContext.clearRect(0, 0, this._boundingBoxCanvas.width, this._boundingBoxCanvas.height);
          }
        }, 3000);
      }
    }, 1000);
  }

  _resizeBoundingBoxCanvas() {
    try {
      if (!this._boundingBoxCanvas || !this.refs.scanditContainer) return;

      const container = this.refs.scanditContainer;
      const rect = container.getBoundingClientRect();

      // Validate dimensions
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      // Set canvas size to match the actual display size
      const newWidth = Math.floor(rect.width);
      const newHeight = Math.floor(rect.height);

      // Set both the canvas internal size and display size
      if (this._boundingBoxCanvas.width !== newWidth || this._boundingBoxCanvas.height !== newHeight) {
        this._boundingBoxCanvas.width = newWidth;
        this._boundingBoxCanvas.height = newHeight;

        // Also set the CSS size to match exactly
        this._boundingBoxCanvas.style.width = newWidth + 'px';
        this._boundingBoxCanvas.style.height = newHeight + 'px';

        console.log("Canvas resized to:", newWidth, "x", newHeight);
      }
    } catch (error) {
      console.warn('Resize canvas error:', error);
    }
  }

  _drawBoundingBoxes(barcodes) {
    try {
      if (!this._boundingBoxContext || !this._boundingBoxCanvas) {
        console.warn("Canvas or context not available for drawing");
        return;
      }

      // Store barcodes for click detection
      this._currentBarcodes = barcodes || [];

      // Debug logging
      console.log("Drawing bounding boxes for", barcodes?.length || 0, "barcodes");
      if (barcodes && barcodes.length > 0) {
        console.log("First barcode location:", barcodes[0].location);
      }

      // Throttle drawing to avoid excessive redraws
      if (this._drawingPending) return;
      this._drawingPending = true;

      // Use requestAnimationFrame for smooth updates
      requestAnimationFrame(() => {
        try {
          this._drawingPending = false;

          const width = this._boundingBoxCanvas.width;
          const height = this._boundingBoxCanvas.height;

          if (width <= 0 || height <= 0) {
            this._resizeBoundingBoxCanvas();
            return;
          }

          // Clear the entire canvas
          this._boundingBoxContext.clearRect(0, 0, width, height);

          if (!barcodes || barcodes.length === 0) return;

          // Set drawing styles
          this._boundingBoxContext.strokeStyle = '#00ff00';
          this._boundingBoxContext.lineWidth = 3;
          this._boundingBoxContext.fillStyle = 'rgba(0, 255, 0, 0.2)';
          this._boundingBoxContext.font = '14px Arial';
          this._boundingBoxContext.textAlign = 'left';

          // Get scaling factors for coordinate transformation
          const videoElement = this.refs.scanditContainer?.querySelector('video');
          let scaleX = 1, scaleY = 1;

          if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
            scaleX = width / videoElement.videoWidth;
            scaleY = height / videoElement.videoHeight;
            console.log(`Video dimensions: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
            console.log(`Canvas dimensions: ${width}x${height}`);
            console.log(`Scale factors: ${scaleX}, ${scaleY}`);
          }

          // Draw all barcodes
          for (const barcode of barcodes) {
            if (!barcode.location || !barcode.location.topLeft) continue;

            const { topLeft, topRight, bottomRight, bottomLeft } = barcode.location;

            // Apply scaling to coordinates
            const scaledTopLeft = { x: topLeft.x * scaleX, y: topLeft.y * scaleY };
            const scaledTopRight = { x: topRight.x * scaleX, y: topRight.y * scaleY };
            const scaledBottomRight = { x: bottomRight.x * scaleX, y: bottomRight.y * scaleY };
            const scaledBottomLeft = { x: bottomLeft.x * scaleX, y: bottomLeft.y * scaleY };

            console.log(`Barcode ${barcode.data}: original=(${topLeft.x},${topLeft.y}) scaled=(${scaledTopLeft.x},${scaledTopLeft.y})`);

            // Draw the bounding box
            this._boundingBoxContext.beginPath();
            this._boundingBoxContext.moveTo(scaledTopLeft.x, scaledTopLeft.y);
            this._boundingBoxContext.lineTo(scaledTopRight.x, scaledTopRight.y);
            this._boundingBoxContext.lineTo(scaledBottomRight.x, scaledBottomRight.y);
            this._boundingBoxContext.lineTo(scaledBottomLeft.x, scaledBottomLeft.y);
            this._boundingBoxContext.closePath();
            this._boundingBoxContext.fill();
            this._boundingBoxContext.stroke();

            // Draw the label
            const text = `${barcode.symbology}: ${barcode.data}`;
            const textX = Math.min(scaledTopLeft.x, scaledBottomLeft.x);
            const textY = Math.min(scaledTopLeft.y, scaledTopRight.y) - 5;

            const textMetrics = this._boundingBoxContext.measureText(text);
            this._boundingBoxContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this._boundingBoxContext.fillRect(textX, textY - 16, textMetrics.width + 8, 20);

            this._boundingBoxContext.fillStyle = '#ffffff';
            this._boundingBoxContext.fillText(text, textX + 4, textY - 2);
            this._boundingBoxContext.fillStyle = 'rgba(0, 255, 0, 0.2)';
          }
        } catch (error) {
          console.error("Error in drawing frame:", error);
          this._drawingPending = false;
        }
      });
    } catch (error) {
      console.error("Error drawing bounding boxes:", error);
    }
  }

  _clearBoundingBoxes() {
    if (this._boundingBoxContext && this._boundingBoxCanvas) {
      this._boundingBoxContext.clearRect(0, 0, this._boundingBoxCanvas.width, this._boundingBoxCanvas.height);
    }
  }

  _handleBoundingBoxClick(event) {
    if (!this._currentBarcodes || this._currentBarcodes.length === 0) return;

    // Get click coordinates relative to canvas
    const rect = this._boundingBoxCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if click is inside any barcode bounding box
    for (const barcode of this._currentBarcodes) {
      if (!barcode.location || !barcode.location.topLeft) continue;

      const { topLeft, topRight, bottomRight, bottomLeft } = barcode.location;

      // Simple point-in-polygon test for the barcode rectangle
      if (this._isPointInBoundingBox(x, y, topLeft, topRight, bottomRight, bottomLeft)) {
        // Barcode clicked - select it
        console.log("Barcode clicked:", barcode.data);
        this.updateValue(barcode.data);
        if (this.refs.barcode) {
          this.refs.barcode.value = barcode.data;
        }
        this.stopScanner();
        break;
      }
    }
  }

  _isPointInBoundingBox(x, y, topLeft, topRight, bottomRight, bottomLeft) {
    // Simple bounding rectangle check
    const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const maxX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
    const maxY = Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);

    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  _startLiveScanningMode() {
    // Clear any existing interval
    if (this._liveScanInterval) {
      clearInterval(this._liveScanInterval);
    }

    // Minimal cleanup - let didUpdateSession handle most of the work
    this._liveScanInterval = setInterval(() => {
      if (!this._isVideoFrozen && this._boundingBoxContext) {
        // Only clear if no barcode activity for a very short time
        if (!this._lastBarcodeTime || Date.now() - this._lastBarcodeTime > 100) {
          // Don't clear immediately - let the session callbacks handle it
        }
      }
    }, 50); // Very frequent checks for responsiveness
  }

  _stopLiveScanningMode() {
    if (this._liveScanInterval) {
      clearInterval(this._liveScanInterval);
      this._liveScanInterval = null;
    }
  }

  _startContinuousTracking() {
    // Clear any existing tracking interval
    if (this._continuousTrackingInterval) {
      clearInterval(this._continuousTrackingInterval);
    }

    // Aggressive continuous tracking - check for barcodes every frame
    this._continuousTrackingInterval = setInterval(() => {
      if (!this._isVideoFrozen && this._barcodeCapture && this._dataCaptureContext) {
        try {
          // Force the barcode capture to stay enabled
          if (this._barcodeCapture.isEnabled === false) {
            this._barcodeCapture.setEnabled(true);
          }

          // Keep the last barcode time updated to prevent clearing
          if (this._currentBarcodes && this._currentBarcodes.length > 0) {
            this._lastBarcodeTime = Date.now();
          }
        } catch (error) {
          console.warn("Error in continuous tracking:", error);
        }
      }
    }, 16); // ~60fps for smooth tracking
  }

  _stopContinuousTracking() {
    if (this._continuousTrackingInterval) {
      clearInterval(this._continuousTrackingInterval);
      this._continuousTrackingInterval = null;
    }
  }

  detach() {
    // Stop live scanning mode
    this._stopLiveScanningMode();

    // Stop continuous tracking
    this._stopContinuousTracking();

    // Clean up resize handler
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      window.removeEventListener('orientationchange', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Clean up bounding box canvas
    if (this._boundingBoxCanvas && this._boundingBoxCanvas.parentNode) {
      this._boundingBoxCanvas.parentNode.removeChild(this._boundingBoxCanvas);
      this._boundingBoxCanvas = null;
      this._boundingBoxContext = null;
    }

    return super.detach();
  }

  destroy() {
    // Clean up Scandit resources
    if (this._barcodeCapture) {
      this._barcodeCapture.removeFromContext();
    }
    
    if (this._dataCaptureContext) {
      this._dataCaptureContext.dispose();
      this._dataCaptureContext = null;
    }
    
    this._barcodeCapture = null;
    this._camera = null;
    this._dataCaptureView = null;
    
    return super.destroy();
  }

  setValue(value, flags = {}) {
    super.setValue(value, flags);
    if (this.refs.barcode) {
      this.refs.barcode.value = value || "";
    }
  }


  
}

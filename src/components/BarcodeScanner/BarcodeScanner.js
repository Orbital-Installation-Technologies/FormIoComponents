import { Components } from "@formio/js";
import BarcodeScannerEditForm from "./BarcodeScanner.form";
import {
  Symbology,
  barcodeCaptureLoader,
  BarcodeBatch,
  BarcodeBatchSettings,
  BarcodeCapture,
  BarcodeCaptureSettings
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
    this._barcodeBatch = null;
    this._barcodeCapture = null; // Fallback option
    this._camera = null;
    this._usingBatch = false; // Track which mode we're using
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
        <div ref="quaggaModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
          <div ref="modalContainer" style="position:relative; background:black; border-radius:8px; overflow:hidden; display:flex; flex-direction:column; max-width:100%; max-height:100%;">
            <button ref="closeModal" style="position:absolute; top:10px; right:10px; z-index:1001; background:rgba(255,255,255,0.8); border:none; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer;">×</button>

            
            <!-- Container for Scandit's DataCaptureView -->
            <div
              ref="scanditContainer"
              style="
                position: relative;
                background: black;
                overflow: hidden;
                min-width: 320px;
                min-height: 240px;
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
      console.log("Starting Scandit initialization...");

      // Check if all required imports are available
      console.log("Checking imports:", {
        configure: typeof configure,
        DataCaptureContext: typeof DataCaptureContext,
        BarcodeCapture: typeof BarcodeCapture,
        BarcodeCaptureSettings: typeof BarcodeCaptureSettings,
        Symbology: typeof Symbology,
        barcodeCaptureLoader: typeof barcodeCaptureLoader
      });

      // Check available symbologies
      console.log("Available symbologies:", {
        Code128: Symbology.Code128,
        Code39: Symbology.Code39,
        QR: Symbology.QR,
        EAN8: Symbology.EAN8,
        UPCE: Symbology.UPCE,
        EAN13UPCA: Symbology.EAN13UPCA,
        DataMatrix: Symbology.DataMatrix
      });

      // Configure Scandit SDK if not already configured
      if (!scanditConfigured) {
        console.log("Configuring Scandit SDK...");
        await configure({
          licenseKey: this._licenseKey,
          // Use CDN for now since serving sdc-lib files requires special webpack configuration
          libraryLocation: "https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-barcode@7.4.0/sdc-lib/",
          moduleLoaders: [barcodeCaptureLoader()]
        });
        scanditConfigured = true;
        console.log("Scandit SDK configured successfully");
      }

      // Create data capture context
      console.log("Creating DataCaptureContext...");
      this._dataCaptureContext = await DataCaptureContext.create();
      console.log("DataCaptureContext created:", this._dataCaptureContext);
      
      // Try BarcodeBatch first for multiple barcode detection, fallback to BarcodeCapture
      let settings;

      try {
        // Use BarcodeCapture for reliable barcode detection
        console.log("Creating BarcodeCaptureSettings...");
        settings = new BarcodeCaptureSettings();
        console.log("BarcodeCaptureSettings created:", settings);

        // Try different approaches to enable symbologies
        console.log("Attempting to enable symbologies...");

        try {
          // Method 1: Try the standard enableSymbologies method with just basic symbologies
          console.log("Method 1: Using enableSymbologies with basic set");
          settings.enableSymbologies([
            Symbology.Code128,
            Symbology.QR
          ]);
          console.log("Method 1 successful");
        } catch (method1Error) {
          console.warn("Method 1 failed:", method1Error);

          try {
            // Method 2: Try enabling symbologies individually
            console.log("Method 2: Enabling symbologies individually");
            const symbologySettings128 = settings.settingsForSymbology(Symbology.Code128);
            if (symbologySettings128) {
              symbologySettings128.isEnabled = true;
              console.log("Code128 enabled individually");
            }

            const symbologySettingsQR = settings.settingsForSymbology(Symbology.QR);
            if (symbologySettingsQR) {
              symbologySettingsQR.isEnabled = true;
              console.log("QR enabled individually");
            }
            console.log("Method 2 successful");
          } catch (method2Error) {
            console.warn("Method 2 failed:", method2Error);
            console.log("Continuing with default symbologies...");
          }
        }

        // Configure for multiple detection and better performance
        settings.codeDuplicateFilter = 0; // Allow immediate re-detection
        console.log("Duplicate filter set to 0");

        // Enable location selection for full camera view
        if (settings.locationSelection) {
          settings.locationSelection = null; // Use full camera view
          console.log("Location selection set to null (full camera view)");
        }

        // Try to enable multiple barcode detection if available
        if (typeof settings.maxNumberOfCodesPerFrame !== 'undefined') {
          settings.maxNumberOfCodesPerFrame = 10; // Allow up to 10 barcodes per frame
          console.log("Max codes per frame set to 10");
        }

        // Disable battery saving for maximum performance
        if (typeof settings.batterySaving !== 'undefined') {
          settings.batterySaving = false;
          console.log("Battery saving disabled for maximum performance");
        }

        // Validate DataCaptureContext before creating BarcodeCapture
        if (!this._dataCaptureContext) {
          throw new Error("DataCaptureContext is null - cannot create BarcodeCapture");
        }

        console.log("Creating BarcodeCapture with context and settings...");
        console.log("Context:", this._dataCaptureContext);
        console.log("Settings:", settings);

        // Create BarcodeCapture instance
        this._barcodeCapture = await BarcodeCapture.forContext(this._dataCaptureContext, settings);

        if (!this._barcodeCapture) {
          throw new Error("BarcodeCapture.forContext returned null");
        }

        this._usingBatch = false;
        console.log("BarcodeCapture created successfully:", this._barcodeCapture);

      } catch (captureError) {
        console.error("BarcodeCapture creation failed:", captureError);
        console.error("Error details:", {
          name: captureError.name,
          message: captureError.message,
          stack: captureError.stack
        });

        // Don't throw the error, instead set a flag and continue with error handling
        this._barcodeCapture = null;
        this._initializationError = captureError;
        console.warn("Continuing without BarcodeCapture - will show error to user");
      }
      
      // Setup BarcodeCapture listener (enhanced for multiple barcode support)
      if (this._barcodeCapture) {
        console.log("Setting up BarcodeCapture listeners...");
        this._barcodeCapture.addListener({
          didUpdateSession: (_, session) => {
            this._handleBarcodeSession(session, "BarcodeCapture");
          },
          didScan: (_, session) => {
            // Handle individual scans for BarcodeCapture
            try {
              if (!session) return;

              const newlyRecognized = session.newlyRecognizedBarcode;
              if (newlyRecognized) {
                console.log("BarcodeCapture - didScan - Single barcode detected:", newlyRecognized.data);

                // Store detected barcode
                const existingCode = this._lastCodes.find(c => c.code === newlyRecognized.data);
                if (!existingCode) {
                  this._lastCodes.push({
                    code: newlyRecognized.data,
                    format: newlyRecognized.symbology
                  });
                }

                // Show visual feedback
                if (this.refs.quaggaModal) {
                  this.refs.quaggaModal.style.border = "4px solid lime";
                  setTimeout(() => {
                    if (this.refs.quaggaModal) {
                      this.refs.quaggaModal.style.border = "";
                    }
                  }, 200);
                }
              }
            } catch (error) {
              console.error("Error in BarcodeCapture didScan:", error);
            }
          }
        });
        console.log("BarcodeCapture listeners set up successfully");
      } else {
        console.error("No BarcodeCapture instance available for listener setup");
        if (this._initializationError) {
          console.error("Initialization error:", this._initializationError);
        }
      }
      
      // Create data capture view
      this._dataCaptureView = await DataCaptureView.forContext(this._dataCaptureContext);

      // Connect barcode capture to view
      this._dataCaptureView.connectToElement(this.refs.scanditContainer);

      // Configure the camera view for responsive sizing
      this._configureCameraView();

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

  _handleBarcodeSession(session, mode) {
    // Shared session handler for both BarcodeBatch and BarcodeCapture
    try {
      if (!session) {
        console.log(`${mode} - No session provided`);
        return;
      }

      // Update last barcode time to keep tracking active
      this._lastBarcodeTime = Date.now();

      let allBarcodes = [];

      // Log session details for debugging
      console.log(`${mode} - Session received:`, {
        trackedBarcodes: session.trackedBarcodes?.size || 0,
        addedTrackedBarcodes: session.addedTrackedBarcodes?.length || 0,
        newlyRecognizedBarcodes: session.newlyRecognizedBarcodes?.length || 0,
        newlyRecognizedBarcode: !!session.newlyRecognizedBarcode
      });

      // BarcodeCapture mode - comprehensive barcode collection

      // Maintain a persistent barcode cache for multiple detection
      if (!this._persistentBarcodes) {
        this._persistentBarcodes = new Map();
      }

      // 1. Check for tracked barcodes (continuous tracking)
      const trackedBarcodes = session.trackedBarcodes || new Map();
      if (trackedBarcodes.size > 0) {
        const tracked = Array.from(trackedBarcodes.values())
          .map(tracked => tracked.barcode)
          .filter(b => b && b.data && b.location);

        // Add to persistent cache
        tracked.forEach(barcode => {
          this._persistentBarcodes.set(barcode.data, {
            barcode: barcode,
            lastSeen: Date.now()
          });
        });

        console.log(`${mode} - Found ${tracked.length} tracked barcodes`);
      }

      // 2. Check for newly recognized barcodes (fresh detections)
      const newlyRecognizedBarcodes = session.newlyRecognizedBarcodes || [];
      if (newlyRecognizedBarcodes.length > 0) {
        const validNewBarcodes = newlyRecognizedBarcodes.filter(b => b && b.data && b.location);

        // Add to persistent cache
        validNewBarcodes.forEach(barcode => {
          this._persistentBarcodes.set(barcode.data, {
            barcode: barcode,
            lastSeen: Date.now()
          });
        });

        console.log(`${mode} - Found ${validNewBarcodes.length} newly recognized barcodes`);
      }

      // 3. Check for single newly recognized barcode (most common case)
      if (session.newlyRecognizedBarcode && session.newlyRecognizedBarcode.data && session.newlyRecognizedBarcode.location) {
        this._persistentBarcodes.set(session.newlyRecognizedBarcode.data, {
          barcode: session.newlyRecognizedBarcode,
          lastSeen: Date.now()
        });
        console.log(`${mode} - Found single newly recognized barcode: ${session.newlyRecognizedBarcode.data}`);
      }

      // 4. Check for added tracked barcodes (if available)
      const addedTrackedBarcodes = session.addedTrackedBarcodes || [];
      if (addedTrackedBarcodes.length > 0) {
        const newBarcodes = addedTrackedBarcodes
          .map(tracked => tracked.barcode)
          .filter(b => b && b.data && b.location);

        // Add to persistent cache
        newBarcodes.forEach(barcode => {
          this._persistentBarcodes.set(barcode.data, {
            barcode: barcode,
            lastSeen: Date.now()
          });
        });

        console.log(`${mode} - Found ${newBarcodes.length} newly added tracked barcodes`);
      }

      // Clean up old barcodes (remove if not seen for 2 seconds)
      const now = Date.now();
      for (const [key, value] of this._persistentBarcodes.entries()) {
        if (now - value.lastSeen > 2000) {
          this._persistentBarcodes.delete(key);
        }
      }

      // Get all current barcodes from persistent cache
      allBarcodes = Array.from(this._persistentBarcodes.values()).map(item => item.barcode);

      if (allBarcodes.length > 0) {
        // Fast deduplication - use a more lenient approach for better tracking
        // const uniqueBarcodes = [];
        // const seenCodes = new Set();

        // for (const barcode of allBarcodes) {
        //   // Use only barcode data for deduplication to allow position updates
        //   const key = barcode.data;
        //   if (!seenCodes.has(key)) {
        //     seenCodes.add(key);
        //     uniqueBarcodes.push(barcode);
        //   }
        // }

        console.log(`${mode} - Drawing ${allBarcodes.length} unique barcodes`);
        // uniqueBarcodes.forEach((barcode, index) => {
        //   console.log(`  Barcode ${index + 1}: "${barcode.data}" (${barcode.symbology})`);
        // });

        // Draw all detected barcodes
        this._drawBoundingBoxes(allBarcodes);

        // Store all detected barcodes for selection (avoid duplicates)
        allBarcodes.forEach(barcode => {
          const existingCode = this._lastCodes.find(c => c.code === barcode.data);
          if (!existingCode) {
            this._lastCodes.push({
              code: barcode.data,
              format: barcode.symbology
            });
          }
        });

        return; // Don't clear if we have barcodes
      } else {
        console.log(`${mode} - No barcodes found in session`);
      }

      // Only clear if we haven't had any barcode activity for a short time
      if (!this._lastBarcodeTime || Date.now() - this._lastBarcodeTime > 200) {
        this._clearBoundingBoxes();
      }
    } catch (error) {
      console.error(`Error in ${mode} session handler:`, error);
    }
  }

  async openScanditModal() {
    this._openModal();
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
      //this.refs.quaggaModal.style.display = "none";
    }
  }
  
  async _setupCamera() {
    try {
      // Get recommended camera settings for BarcodeCapture
      const cameraSettings = BarcodeCapture.recommendedCameraSettings;
      console.log("Using BarcodeCapture recommended camera settings");

      // Get camera
      this._camera = Camera.default;
      if (this._camera) {
        // Set camera settings
        await this._camera.applySettings(cameraSettings);
        console.log("Camera settings applied");

        // Set camera as frame source
        await this._dataCaptureContext.setFrameSource(this._camera);
        console.log("Camera set as frame source");

        // Switch camera on
        await this._camera.switchToDesiredState(FrameSourceState.On);
        console.log("Camera switched on");

        // Start BarcodeCapture scanning
        if (this._barcodeCapture) {
          await this._barcodeCapture.setEnabled(true);
          console.log("BarcodeCapture enabled successfully");
        } else {
          const errorMsg = this._initializationError
            ? `BarcodeCapture initialization failed: ${this._initializationError.message}`
            : "BarcodeCapture instance is null";
          console.error(errorMsg);
          throw new Error(errorMsg);
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

      // Stop BarcodeCapture
      if (this._barcodeCapture) {
        await this._barcodeCapture.setEnabled(false);
        console.log("BarcodeCapture disabled");
      }

      // Stop live scanning mode
      this._stopLiveScanningMode();

      // Stop continuous tracking
      this._stopContinuousTracking();

      // Clear bounding boxes
      this._clearBoundingBoxes();

      // Properly close the modal to avoid ResizeObserver errors
      this._closeModal();

      this._isVideoFrozen = false;
    } catch (e) {
      console.error("Error stopping scanner:", e);
    }
  }

  _configureCameraView() {
    try {
      if (!this.refs.scanditContainer) return;

      // Add CSS to ensure camera view fits properly and container sizes to camera
      const style = document.createElement('style');
      style.id = 'scandit-camera-responsive-styles';
      if (!document.getElementById('scandit-camera-responsive-styles')) {
        style.textContent = `
          /* Container should size to fit camera */
          .scandit-container {
            display: inline-block !important;
            position: relative !important;
          }

          /* Video should maintain its natural aspect ratio */
          .scandit-container video {
            display: block !important;
            max-width: 100vw !important;
            max-height: 80vh !important;
            width: auto !important;
            height: auto !important;
          }

          /* DataCaptureView should match video size exactly */
          .scandit-container > div {
            position: relative !important;
            display: inline-block !important;
          }

          /* Mobile specific fixes */
          @media (max-width: 768px) {
            .scandit-container video {
              max-width: 95vw !important;
              max-height: 70vh !important;
            }
          }

          /* iOS specific fixes */
          @supports (-webkit-touch-callout: none) {
            .scandit-container video {
              transform: translateZ(0) !important;
              -webkit-transform: translateZ(0) !important;
            }
          }
        `;
        document.head.appendChild(style);
      }

      // Add responsive class to container
      this.refs.scanditContainer.classList.add('scandit-container');

      // Wait for video to load and then size container to match
      this._waitForVideoAndResize();

      console.log("Camera view configured for responsive sizing");
    } catch (error) {
      console.warn("Error configuring camera view:", error);
    }
  }

  _waitForVideoAndResize() {
    // Poll for video element and resize when found
    const checkForVideo = () => {
      const video = this.refs.scanditContainer?.querySelector('video');
      if (video) {
        console.log("Video element found, setting up sizing");

        // Wait for video metadata to load
        if (video.videoWidth && video.videoHeight) {
          this._sizeContainerToCamera(video);
        } else {
          video.addEventListener('loadedmetadata', () => {
            this._sizeContainerToCamera(video);
          });
        }

        // Set up resize observer for the video
        if (window.ResizeObserver) {
          this._cameraResizeObserver = new ResizeObserver(() => {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = setTimeout(() => {
              this._sizeContainerToCamera(video);
              this._handleCameraResize();
            }, 100);
          });
          this._cameraResizeObserver.observe(video);
        }
      } else {
        // Keep checking for video element
        setTimeout(checkForVideo, 100);
      }
    };

    checkForVideo();
  }

  _sizeContainerToCamera(video) {
    try {
      if (!video || !video.videoWidth || !video.videoHeight) return;

      const videoAspectRatio = video.videoWidth / video.videoHeight;
      const maxWidth = Math.min(window.innerWidth * 0.95, 800);
      const maxHeight = Math.min(window.innerHeight * 0.8, 600);

      let containerWidth, containerHeight;

      // Calculate optimal size maintaining aspect ratio
      if (maxWidth / maxHeight > videoAspectRatio) {
        // Height is the limiting factor
        containerHeight = maxHeight;
        containerWidth = containerHeight * videoAspectRatio;
      } else {
        // Width is the limiting factor
        containerWidth = maxWidth;
        containerHeight = containerWidth / videoAspectRatio;
      }

      // Apply size to modal container
      if (this.refs.modalContainer) {
        this.refs.modalContainer.style.width = `${containerWidth}px`;
        this.refs.modalContainer.style.height = `${containerHeight}px`;
      }

      // Apply size to scandit container
      this.refs.scanditContainer.style.width = `${containerWidth}px`;
      this.refs.scanditContainer.style.height = `${containerHeight}px`;

      console.log(`Container sized to: ${containerWidth}x${containerHeight} (aspect ratio: ${videoAspectRatio})`);

      // Force canvas resize after container resize
      setTimeout(() => {
        this._resizeBoundingBoxCanvas();
      }, 50);

    } catch (error) {
      console.warn("Error sizing container to camera:", error);
    }
  }

  _handleCameraResize() {
    try {
      // Clear cached scale factors to force recalculation
      this._cachedScaleFactors = null;

      // Resize bounding box canvas
      this._resizeBoundingBoxCanvas();

      // Force redraw of current barcodes
      if (this._currentBarcodes && this._currentBarcodes.length > 0) {
        this._drawBoundingBoxes(this._currentBarcodes);
      }

      console.log("Camera view resized and bounding boxes updated");
    } catch (error) {
      console.warn("Error handling camera resize:", error);
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

      // Use device pixel ratio for high-DPI displays (important for iOS)
      const devicePixelRatio = window.devicePixelRatio || 1;

      // Set canvas size to match the actual display size
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);

      // Set internal canvas size accounting for device pixel ratio
      const canvasWidth = Math.floor(displayWidth * devicePixelRatio);
      const canvasHeight = Math.floor(displayHeight * devicePixelRatio);

      // Set both the canvas internal size and display size
      if (this._boundingBoxCanvas.width !== canvasWidth || this._boundingBoxCanvas.height !== canvasHeight) {
        // Set internal resolution
        this._boundingBoxCanvas.width = canvasWidth;
        this._boundingBoxCanvas.height = canvasHeight;

        // Set CSS display size
        this._boundingBoxCanvas.style.width = displayWidth + 'px';
        this._boundingBoxCanvas.style.height = displayHeight + 'px';

        // Scale the context to match device pixel ratio
        if (this._boundingBoxContext) {
          this._boundingBoxContext.scale(devicePixelRatio, devicePixelRatio);
        }

        // Clear cached scale factors when canvas resizes
        this._cachedScaleFactors = null;

        console.log("Canvas resized to:", canvasWidth, "x", canvasHeight, "display:", displayWidth, "x", displayHeight, "DPR:", devicePixelRatio);
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

      console.log("_drawBoundingBoxes called with", barcodes?.length || 0, "barcodes");

      if (!barcodes || barcodes.length === 0) {
        console.log("No barcodes to draw, clearing canvas");
        this._clearBoundingBoxes();
        return;
      }

      // Use requestAnimationFrame for smooth rendering but with faster response
      if (this._animationFrameId) {
        cancelAnimationFrame(this._animationFrameId);
      }

      this._animationFrameId = requestAnimationFrame(() => {
        try {

          const width = this._boundingBoxCanvas.width;
          const height = this._boundingBoxCanvas.height;

          console.log("Canvas dimensions:", width, "x", height);

          if (width <= 0 || height <= 0) {
            console.log("Canvas has invalid dimensions, resizing...");
            this._resizeBoundingBoxCanvas();
            return;
          }

          // Clear the entire canvas
          this._boundingBoxContext.clearRect(0, 0, width, height);
          console.log("Canvas cleared");

          if (!barcodes || barcodes.length === 0) {
            console.log("No barcodes to draw after clearing");
            return;
          }

          // Set drawing styles
          this._boundingBoxContext.strokeStyle = '#00ff00';
          this._boundingBoxContext.lineWidth = 3;
          this._boundingBoxContext.fillStyle = 'rgba(0, 255, 0, 0.2)';
          this._boundingBoxContext.font = '14px Arial';
          this._boundingBoxContext.textAlign = 'left';

          // Get scaling factors for coordinate transformation (iOS-compatible)
          if (!this._cachedScaleFactors) {
            const videoElement = this.refs.scanditContainer?.querySelector('video');
            const container = this.refs.scanditContainer;

            if (videoElement && videoElement.videoWidth && videoElement.videoHeight && container) {
              // Get actual displayed video dimensions
              const videoRect = videoElement.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();

              // Calculate the actual video display size within the container
              const videoDisplayWidth = videoRect.width;
              const videoDisplayHeight = videoRect.height;

              // Calculate canvas display size
              const canvasDisplayWidth = this._boundingBoxCanvas.style.width ?
                parseFloat(this._boundingBoxCanvas.style.width) : containerRect.width;
              const canvasDisplayHeight = this._boundingBoxCanvas.style.height ?
                parseFloat(this._boundingBoxCanvas.style.height) : containerRect.height;

              // Calculate scale factors based on video stream resolution to canvas display size
              this._cachedScaleFactors = {
                scaleX: canvasDisplayWidth / videoElement.videoWidth,
                scaleY: canvasDisplayHeight / videoElement.videoHeight
              };

              console.log("Scale calculation:", {
                videoStream: `${videoElement.videoWidth}x${videoElement.videoHeight}`,
                videoDisplay: `${videoDisplayWidth}x${videoDisplayHeight}`,
                canvasDisplay: `${canvasDisplayWidth}x${canvasDisplayHeight}`,
                scale: this._cachedScaleFactors
              });
            } else {
              this._cachedScaleFactors = { scaleX: 1, scaleY: 1 };
              console.warn("Using default scale factors - video element not found or not ready");
            }
          }

          const { scaleX, scaleY } = this._cachedScaleFactors;

          // Draw all barcodes with optimized rendering
          for (const barcode of barcodes) {
            if (!barcode.location || !barcode.location.topLeft) continue;

            const { topLeft, topRight, bottomRight, bottomLeft } = barcode.location;

            // Apply scaling to coordinates (inline for speed)
            const x1 = topLeft.x * scaleX;
            const y1 = topLeft.y * scaleY;
            const x2 = topRight.x * scaleX;
            const y2 = topRight.y * scaleY;
            const x3 = bottomRight.x * scaleX;
            const y3 = bottomRight.y * scaleY;
            const x4 = bottomLeft.x * scaleX;
            const y4 = bottomLeft.y * scaleY;

            // Draw the bounding box (optimized path)
            this._boundingBoxContext.beginPath();
            this._boundingBoxContext.moveTo(x1, y1);
            this._boundingBoxContext.lineTo(x2, y2);
            this._boundingBoxContext.lineTo(x3, y3);
            this._boundingBoxContext.lineTo(x4, y4);
            this._boundingBoxContext.closePath();
            this._boundingBoxContext.fill();
            this._boundingBoxContext.stroke();

            // Draw the label (optimized)
            const text = `${barcode.symbology}: ${barcode.data}`;
            const textX = Math.min(x1, x4);
            const textY = Math.min(y1, y2) - 5;

            const textMetrics = this._boundingBoxContext.measureText(text);
            this._boundingBoxContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this._boundingBoxContext.fillRect(textX, textY - 16, textMetrics.width + 8, 20);

            this._boundingBoxContext.fillStyle = '#ffffff';
            this._boundingBoxContext.fillText(text, textX + 4, textY - 2);
            this._boundingBoxContext.fillStyle = 'rgba(0, 255, 0, 0.2)';
          }
        } catch (error) {
          console.error("Error in drawing frame:", error);
        }
      });
    } catch (error) {
      console.error("Error drawing bounding boxes:", error);
    }
  }

  _closeModal() {
    if (!this.refs.quaggaModal) return;

    try {
      // Method 1: Use CSS class-based approach to avoid ResizeObserver issues
      // This is the most reliable method to prevent layout thrashing

      // Add a CSS class for hiding instead of direct style manipulation
      if (!document.getElementById('barcode-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'barcode-modal-styles';
        style.textContent = `
          .barcode-modal-hidden {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            transition: opacity 0.2s ease-out !important;
          }
          .barcode-modal-closing {
            opacity: 0 !important;
            transition: opacity 0.2s ease-out !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Use requestAnimationFrame to avoid ResizeObserver conflicts
      requestAnimationFrame(() => {
        try {
          this.refs.quaggaModal.style.visibility = "hidden";
        } catch (error) {
          console.warn("Error in modal CSS transition:", error);
          // Fallback: use visibility instead of display
          if (this.refs.quaggaModal) {
            this.refs.quaggaModal.style.visibility = "hidden";
            this.refs.quaggaModal.style.pointerEvents = "none";
            setTimeout(() => {
              if (this.refs.quaggaModal) {
                this.refs.quaggaModal.style.display = "none";
                this.refs.quaggaModal.style.visibility = "visible";
                this.refs.quaggaModal.style.pointerEvents = "auto";
              }
            }, 50);
          }
        }
      });
    } catch (error) {
      console.warn("Error closing modal:", error);
      // Ultimate fallback - use visibility to avoid ResizeObserver issues
      if (this.refs.quaggaModal) {
        this.refs.quaggaModal.style.visibility = "hidden";
        this.refs.quaggaModal.style.pointerEvents = "none";
      }
    }
  }

  _openModal() {
    if (!this.refs.quaggaModal) return;

    try {
      // Remove any hiding classes
      this.refs.quaggaModal.classList.remove('barcode-modal-hidden', 'barcode-modal-closing');

      // Reset styles
      this.refs.quaggaModal.style.visibility = "visible";
      this.refs.quaggaModal.style.pointerEvents = "auto";
      this.refs.quaggaModal.style.opacity = "1";

      // Show the modal
      this.refs.quaggaModal.style.display = "flex";

      console.log("Modal opened successfully");
    } catch (error) {
      console.warn("Error opening modal:", error);
      // Fallback
      if (this.refs.quaggaModal) {
        this.refs.quaggaModal.style.display = "flex";
      }
    }
  }

  _clearBoundingBoxes() {
    if (this._boundingBoxContext && this._boundingBoxCanvas) {
      this._boundingBoxContext.clearRect(0, 0, this._boundingBoxCanvas.width, this._boundingBoxCanvas.height);
    }
  }

  _handleBoundingBoxClick(event) {
    if (!this._currentBarcodes || this._currentBarcodes.length === 0) return;

    // Get click coordinates relative to canvas (accounting for device pixel ratio)
    const rect = this._boundingBoxCanvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Calculate click position in canvas display coordinates
    const clickX = (event.clientX - rect.left);
    const clickY = (event.clientY - rect.top);

    console.log(`Click detected at: (${clickX}, ${clickY}) DPR: ${devicePixelRatio}`);

    // Get the same scale factors used for drawing
    const { scaleX, scaleY } = this._cachedScaleFactors || { scaleX: 1, scaleY: 1 };

    // Check if click is inside any barcode bounding box
    for (const barcode of this._currentBarcodes) {
      if (!barcode.location || !barcode.location.topLeft) continue;

      const { topLeft, topRight, bottomRight, bottomLeft } = barcode.location;

      // Apply the same scaling used for drawing
      const scaledTopLeft = { x: topLeft.x * scaleX, y: topLeft.y * scaleY };
      const scaledTopRight = { x: topRight.x * scaleX, y: topRight.y * scaleY };
      const scaledBottomRight = { x: bottomRight.x * scaleX, y: bottomRight.y * scaleY };
      const scaledBottomLeft = { x: bottomLeft.x * scaleX, y: bottomLeft.y * scaleY };

      // Check if click is inside this barcode's bounding box
      if (this._isPointInBoundingBox(clickX, clickY, scaledTopLeft, scaledTopRight, scaledBottomRight, scaledBottomLeft)) {
        // Barcode clicked - select it and send to outer input
        console.log("Barcode clicked:", barcode.data);

        // Use setValue to properly update the component value and trigger events
        this.setValue(barcode.data);

        // Also update the internal input field
        if (this.refs.barcode) {
          this.refs.barcode.value = barcode.data;
        }

        // Stop the scanner
        this.stopScanner();
        break;
      }
    }
  }

  _isPointInBoundingBox(x, y, topLeft, topRight, bottomRight, bottomLeft) {
    // Simple bounding rectangle check with scaled coordinates
    const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const maxX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
    const maxY = Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);

    const isInside = x >= minX && x <= maxX && y >= minY && y <= maxY;

    if (isInside) {
      console.log(`Click (${x}, ${y}) is inside bounding box: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
    }

    return isInside;
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
      if (!this._isVideoFrozen && this._dataCaptureContext && this._barcodeCapture) {
        try {
          // Force BarcodeCapture to stay enabled
          if (this._barcodeCapture.isEnabled === false) {
            this._barcodeCapture.setEnabled(true);
            console.log("Re-enabled BarcodeCapture");
          }

          // Keep the last barcode time updated to prevent clearing
          if (this._currentBarcodes && this._currentBarcodes.length > 0) {
            this._lastBarcodeTime = Date.now();
          }

          // Force redraw of persistent barcodes to maintain multiple detection
          if (this._persistentBarcodes && this._persistentBarcodes.size > 0) {
            const allBarcodes = Array.from(this._persistentBarcodes.values()).map(item => item.barcode);
            if (allBarcodes.length > 0) {
              this._drawBoundingBoxes(allBarcodes);
            }
          }
        } catch (error) {
          console.warn("Error in continuous tracking:", error);
        }
      }
    }, 33); // 30fps for smooth tracking with multiple barcode persistence
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
    if (this._barcodeBatch) {
      this._barcodeBatch.removeFromContext();
    }

    if (this._barcodeCapture) {
      this._barcodeCapture.removeFromContext();
    }

    if (this._dataCaptureContext) {
      this._dataCaptureContext.dispose();
      this._dataCaptureContext = null;
    }

    // Clean up resize observers
    if (this._cameraResizeObserver) {
      this._cameraResizeObserver.disconnect();
      this._cameraResizeObserver = null;
    }

    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }

    // Clean up intervals
    if (this._continuousTrackingInterval) {
      clearInterval(this._continuousTrackingInterval);
      this._continuousTrackingInterval = null;
    }

    this._barcodeBatch = null;
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

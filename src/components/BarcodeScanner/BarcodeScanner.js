import { Components } from "@formio/js";
import BarcodeScannerEditForm from "./BarcodeScanner.form";
import {
  Symbology,
  barcodeCaptureLoader,
  BarcodeBatch,
  BarcodeBatchSettings,
  BarcodeBatchBasicOverlay,
  BarcodeBatchBasicOverlayStyle
} from "@scandit/web-datacapture-barcode";
import {
  DataCaptureView,
  DataCaptureContext,
  FrameSourceState,
  Camera,
  configure
} from "@scandit/web-datacapture-core";

const TextField = Components.components.textfield;
const FieldComponent = Components.components.field;

let scanditConfigured = false;

export default class BarcodeScanner extends FieldComponent {

  static schema(...extend) {
    return FieldComponent.schema(
      {
        type: "barcode",
        label: "Barcode",
        key: "",
        icon: "barcode",
        iconSize: '2rem',
        color: 'blue',
        numberOfIcons: 1,
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
    this._lastCodes = [];
    this._currentBarcodes = [];
    this._isVideoFrozen = false;
    this._dataCaptureContext = null;
    this._barcodeBatch = null;
    this._barcodeCapture = null;
    this._camera = null;
    this._usingBatch = false;
    this._dataCaptureView = null;
    this._drawingPending = false;
    this._manualErrors = [];
    this._allowErrorClear = false;

    // Track errors mutations so we can log when something clears them.
    // Capture the initial errors value before redefining the property.
    const initialErrors = Array.isArray(this.errors) ? [...this.errors] : this.errors;
    this._trackedErrors = initialErrors;
    Object.defineProperty(this, "errors", {
      configurable: true,
      enumerable: true,
      get: () => this._trackedErrors,
      set: (value) => {
        const previous = this._trackedErrors;
        const changed = !this._areErrorsEqual(previous, value);
        if (changed) {
          console.log("[BarcodeScanner][errors setter] errors changed", {
            previous,
            next: value,
            stack: new Error().stack,
          });
        }
        this._trackedErrors = value;
      },
    });

    let envKey;
    if (typeof process !== 'undefined' && process?.env && process.env.NEXT_PUBLIC_SCANDIT_KEY) {
      envKey = process?.env?.NEXT_PUBLIC_SCANDIT_KEY;
    }
    this._licenseKey = envKey || 'undefined'
  }

  init() {
    super.init();
  }

  render() {
    const cameraSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" fill="currentColor">
      <path d="M149.1 64.8L138.7 96H64C28.7 96 0 124.7 0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H373.3L362.9 64.8C356.4 45.2 338.1 32 317.4 32H194.6c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/>
    </svg>`;

    const fileImageSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16" height="16" fill="currentColor">
      <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM64 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm152 32c5.3 0 10.2 2.6 13.2 6.9l88 128c3.4 4.9 3.7 11.3 1 16.5s-8.2 8.6-14.2 8.6H216 176 128 80c-5.8 0-11.1-3.1-13.9-8.1s-2.8-11.2 .2-16.1l48-80c2.9-4.8 8.1-7.8 13.7-7.8s10.8 2.9 13.7 7.8l12.8 21.4 48.3-70.2c3-4.3 7.9-6.9 13.2-6.9z"/>
    </svg>`;

    if (!document.getElementById('material-icons-font')) {
      const link = document.createElement('link');
      link.id = 'material-icons-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
      document.head.appendChild(link);
    }

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
        </div>
        <div ref="quaggaModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
          <div ref="modalContainer" style="position:relative; background:black; border-radius:8px; overflow:hidden; display:flex; flex-direction:column; max-width:100%; max-height:100%;">
            <button ref="closeModal" style="position:absolute; top:10px; right:10px; z-index:10000; background:rgba(255,255,255,0.9); border:none; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:bold; cursor:pointer; pointer-events:auto; box-shadow:0 2px 8px rgba(0,0,0,0.3);" title="Close">×</button>

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
              font-family: 'Material Symbols Outlined';
              font-size: 24px;
              cursor: pointer;
            ">
            pause
          </button>
        </div>
      </div>
    `);
  }

  validateAndSetDirty() {
    const valid = this.checkValidity(this.data, true);
    if (!valid) {
      setTimeout(() => {
        console.log("[BarcodeScanner][L166] setCustomValidity(errors, true) invoked with errors:", this.errors);
        this._allowErrorClear = false;
        this.setCustomValidity(this.errors, true);
      }, 500);
    } else {
      // Ensure error state is cleared and DOM is updated!
      this._allowErrorClear = true;
      this.setCustomValidity([], true); 
      this._allowErrorClear = false;
    }
  }

  attach(element) {
    const attached = super.attach(element);

    this._unhandledRejectionHandler = (event) => {
      if (event.reason && (
          event.reason.name === 'NotAllowedError' || 
          event.reason.message?.includes('Permission denied') ||
          event.reason.message?.includes('permission')
      )) {
        console.warn('Camera permission error suppressed:', event.reason);
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('unhandledrejection', this._unhandledRejectionHandler);

    this.loadRefs(element, {
      barcode: "single",
      scanButton: "single",
      quaggaModal: "single",
      scanditContainer: "single",
      closeModal: "single",
      freezeButton: "single",
    });

    if (
      !this.refs.barcode ||
      !this.refs.scanButton ||
      !this.refs.quaggaModal ||
      !this.refs.scanditContainer ||
      !this.refs.closeModal ||
      !this.refs.freezeButton
    ) {
      return attached;
    }

    if (this.dataValue) {
      this.refs.barcode.value = this.dataValue;
    }

    if (!this.component.disabled) {
      const input = this.refs.barcode;

      this.addEventListener(input, 'input', (event) => {
        this.updateValue(event.target.value);
        this.validateAndSetDirty();
      });

      this.addEventListener(input, 'blur', () => {
        this.validateAndSetDirty();
      });

      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
      });

      this.refs.scanButton.addEventListener("click", () => {
        this.openScanditModal();
      });

      this.refs.closeModal.addEventListener("click", async () => {
        try {
          await this.stopScanner();
          this._lastCodes = [];
          this._isVideoFrozen = false;
        } catch (error) {
          console.warn("Error in close button handler (handled):", error);
          this._closeModal();
        }
      });

      this.refs.freezeButton.addEventListener("click", () => {
        this._toggleFreezeVideo();
      });
    }

    return attached;
  }

  _showImageInModal(image) {
    this._openModal();

    if (this._uploadedImageElement && this._uploadedImageElement.parentNode) {
      this._uploadedImageElement.parentNode.removeChild(this._uploadedImageElement);
      this._uploadedImageElement = null;
    }

    this._uploadedImageElement = image;
    image.style.maxWidth = '100%';
    image.style.maxHeight = '100%';
    image.style.position = 'absolute';
    image.style.top = '0';
    image.style.left = '0';
    image.style.zIndex = '10';
    image.style.objectFit = 'contain';
    image.style.display = 'block';

    Array.from(this.refs.scanditContainer.querySelectorAll('img')).forEach(img => {
      if (img !== image) img.parentNode.removeChild(img);
    });
    this.refs.scanditContainer.appendChild(image);

    if (this._boundingBoxCanvas) {
      this._boundingBoxCanvas.style.zIndex = '20';
    }

    this._cachedScaleFactors = null;

    image.onload = () => {
      this._resizeBoundingBoxCanvas();
    };
    if (image.complete) {
      image.onload();
    }
  }

  async openScanditModal() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    this._openModal();
    this._lastCodes = [];
    this._isVideoFrozen = false;

    if (this._uploadedImageElement && this._uploadedImageElement.parentNode) {
      this._uploadedImageElement.parentNode.removeChild(this._uploadedImageElement);
      this._uploadedImageElement = null;
    }

    const video = this.refs.scanditContainer.querySelector('video');
    if (video) video.style.display = '';

    if (this.refs.freezeButton) {
      this.refs.freezeButton.innerHTML = 'pause';
      this.refs.freezeButton.style.background = "rgba(255,255,255,0.8)";
      this.refs.freezeButton.style.display = "flex";
    }

    try {
      if (!this._dataCaptureContext) {
        await this._initializeScandit();
      } else {
        if (this._dataCaptureView && this.refs.scanditContainer) {
          this._dataCaptureView.connectToElement(this.refs.scanditContainer);
        }
        
        if (!this._boundingBoxCanvas || !this._boundingBoxCanvas.parentNode) {
          this._createBoundingBoxOverlay();
        } else {
          this._resizeBoundingBoxCanvas();
        }
        
        this._startLiveScanningMode();
        this._startCameraMonitoring();
        this._currentBarcodes = [];
        this._drawBoundingBoxes(this._currentBarcodes);
      }
      if (this._dataCaptureContext) {
        await this._setupCamera();
      }
    } catch (error) {
      console.warn("Scanner initialization error (handled):", error);
    }
  }

  _resizeBoundingBoxCanvas() {
    try {
      if (!this._boundingBoxCanvas || !this.refs.scanditContainer) return;
      const container = this.refs.scanditContainer;
      const rect = container.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);
      const canvasWidth = Math.floor(displayWidth * devicePixelRatio);
      const canvasHeight = Math.floor(displayHeight * devicePixelRatio);
      if (this._boundingBoxCanvas.width !== canvasWidth || this._boundingBoxCanvas.height !== canvasHeight) {
        this._boundingBoxCanvas.width = canvasWidth;
        this._boundingBoxCanvas.height = canvasHeight;
        this._boundingBoxCanvas.style.width = displayWidth + 'px';
        this._boundingBoxCanvas.style.height = displayHeight + 'px';
        if (this._boundingBoxContext) {
          this._boundingBoxContext.setTransform(1, 0, 0, 1, 0, 0);
          this._boundingBoxContext.scale(devicePixelRatio, devicePixelRatio);
        }
        this._cachedScaleFactors = null;
      }

      const videoElement = container.querySelector('video');
      const imageElement = this._uploadedImageElement;
      if (imageElement && imageElement.naturalWidth && imageElement.naturalHeight) {
        this._cachedScaleFactors = {
          scaleX: displayWidth / imageElement.naturalWidth,
          scaleY: displayHeight / imageElement.naturalHeight
        };
      } else if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
        this._cachedScaleFactors = {
          scaleX: displayWidth / videoElement.videoWidth,
          scaleY: displayHeight / videoElement.videoHeight
        };
      } else {
        this._cachedScaleFactors = { scaleX: 1, scaleY: 1 };
      }
    } catch (error) {}
  }

  async _initializeScandit() {
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('NotAllowedError') || message.includes('Permission denied')) {
        console.warn('[Suppressed Scandit error]:', ...args);
      } else {
        originalConsoleError.apply(console, args);
      }
    };

    try {
        if (!scanditConfigured) {
            await configure({
                licenseKey: this._licenseKey,
                libraryLocation: "https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-barcode@7.6.1/sdc-lib/",
                moduleLoaders: [barcodeCaptureLoader()]
            });
            scanditConfigured = true;
        }

        this._dataCaptureContext = await DataCaptureContext.create();

        let settings = new BarcodeBatchSettings();
        const allSymbologies = [
            Symbology.Code128, Symbology.Code39, Symbology.Code93, Symbology.Code11, Symbology.Codabar,
            Symbology.EAN13UPCA, Symbology.EAN8, Symbology.UPCE, Symbology.ITF, Symbology.MSIPlessey,
            Symbology.QR, Symbology.DataMatrix, Symbology.PDF417, Symbology.Aztec, Symbology.MaxiCode,
            Symbology.KIX, Symbology.RM4SCC, Symbology.GS1Databar, Symbology.GS1DatabarExpanded,
            Symbology.GS1DatabarLimited, Symbology.MicroPDF417, Symbology.MicroQR, Symbology.DotCode,
            Symbology.ArUco, Symbology.Code25, Symbology.Code32, Symbology.Pharmacode, Symbology.TwoDigitAddOn,
            Symbology.FiveDigitAddOn, Symbology.Matrix2of5, Symbology.IATA2of5, Symbology.Industrial2of5
        ];
        const availableSymbologies = allSymbologies.filter(sym => sym !== undefined);
        settings.enableSymbologies(availableSymbologies);

        settings.codeDuplicateFilter = 0;

        if (settings.locationSelection) {
            settings.locationSelection = null;
        }

        if (typeof settings.maxNumberOfCodesPerFrame !== 'undefined') {
            settings.maxNumberOfCodesPerFrame = 10;
        }

        if (typeof settings.batterySaving !== 'undefined') {
            settings.batterySaving = false;
        }

        this._configureAdvancedSymbologySettings(settings);

        if (!this._dataCaptureContext) {
            throw new Error("DataCaptureContext is null - cannot create BarcodeCapture");
        }

        this._barcodeBatch = await BarcodeBatch.forContext(this._dataCaptureContext, settings);

        await this._barcodeBatch.setEnabled(true);
        this._usingBatch = true;

        this._trackedBarcodes = {};
        this._barcodeBatch.addListener({
            didUpdateSession: (barcodeBatchMode, session) => {
                this._trackedBarcodes = session.trackedBarcodes || {};
                const barcodes = Object.values(this._trackedBarcodes).map(tb => tb.barcode);
                this._currentBarcodes = barcodes;
                this._drawBoundingBoxes(this._currentBarcodes);
            }
        });

        this._dataCaptureView = await DataCaptureView.forContext(this._dataCaptureContext);
        this._dataCaptureView.connectToElement(this.refs.scanditContainer);

        await BarcodeBatchBasicOverlay.withBarcodeBatchForViewWithStyle(
            this._barcodeBatch,
            this._dataCaptureView,
            BarcodeBatchBasicOverlayStyle.Frame
        );

        if (!document.getElementById('hide-scandit-blue-frames')) {
            const style = document.createElement('style');
            style.id = 'hide-scandit-blue-frames';
            style.textContent = `
                .scandit-barcode-batch-basic-overlay-frame,
                .scandit-barcode-batch-basic-overlay-frame * {
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        this._configureCameraView();
        this._createBoundingBoxOverlay();
        this._startLiveScanningMode();

        this._currentBarcodes = [];
        this._drawBoundingBoxes(this._currentBarcodes);
    } catch (error) {
        console.warn("Barcode scanner initialization error (handled):", error);
    } finally {
        console.error = originalConsoleError;
    }
  }

  async _setupCamera() {
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('NotAllowedError') || message.includes('Permission denied')) {
        console.warn('[Suppressed camera error]:', ...args);
      } else {
        originalConsoleError.apply(console, args);
      }
    };

    try {
        const cameraSettings = BarcodeBatch.recommendedCameraSettings;
        this._camera = Camera.default;

        if (this._camera) {
            await this._camera.applySettings(cameraSettings);
            await this._dataCaptureContext.setFrameSource(this._camera);
            await this._camera.switchToDesiredState(FrameSourceState.On);

            if (this._barcodeBatch) {
                await this._barcodeBatch.setEnabled(true);
            } else {
                const errorMsg = this._initializationError
                    ? `BarcodeBatch initialization failed: ${this._initializationError.message}`
                    : "BarcodeBatch instance is null";
                throw new Error(errorMsg);
            }
        } else {
            console.warn("No camera available");
        }
    } catch (error) {
        console.warn("Camera access error (handled):", error);
        
        if (this.refs.freezeButton) {
            this.refs.freezeButton.style.display = 'none';
        }
        
        if (this.refs.scanditContainer) {
            this.refs.scanditContainer.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 300px;
                    min-width: 320px;
                    padding: 40px 20px;
                ">
                    <div style="
                        color: white;
                        text-align: center;
                        font-size: 1rem;
                        max-width: 400px;
                    ">
                        <div style="font-size: 2.5rem; margin-bottom: 20px;">⚠️</div>
                        <div style="font-weight: bold; margin-bottom: 10px;">Camera Access Denied</div>
                        <div>Please allow access to the camera in your device settings and try again.</div>
                    </div>
                </div>`;
        }
    } finally {
        console.error = originalConsoleError;
    }
  }

  _toggleFreezeVideo() {
    try {
      this._isVideoFrozen = !this._isVideoFrozen;
      if (this._isVideoFrozen) {
        this.refs.freezeButton.innerHTML = 'play_arrow';
        this.refs.freezeButton.style.background = "rgba(0,255,0,0.8)";
        this.refs.freezeButton.style.color = "#333";
        if (this._camera) {
          this._camera.switchToDesiredState(FrameSourceState.Off);
        }

        if (this._usingBatch && this._trackedBarcodes) {
          const allCodes = Object.values(this._trackedBarcodes)
            .map(tb => tb.barcode.data)
            .filter(Boolean);
          if (allCodes.length > 0) {
            this.updateValue(allCodes.join(", "));
            this.refs.barcode.value = allCodes.join(", ");
            this.validateAndSetDirty();
          }
        } else if (this._lastCodes.length === 1) {
          this.updateValue(this._lastCodes[0].code);
          this.refs.barcode.value = this._lastCodes[0].code;
          this.validateAndSetDirty();
        }
      } else {
        this.refs.freezeButton.innerHTML = 'pause';
        this.refs.freezeButton.style.background = "rgba(255,255,255,0.8)";
        this.refs.freezeButton.style.color = "#333";
        if (this._camera) {
          this._camera.switchToDesiredState(FrameSourceState.On);
        }
      }
    } catch (e) {}
  }

  async stopScanner() {
    try {
      if (this._animationFrameId) {
        cancelAnimationFrame(this._animationFrameId);
        this._animationFrameId = null;
      }

      if (this._camera) {
        try {
          await this._camera.switchToDesiredState(FrameSourceState.Off);
        } catch (cameraError) {
          console.warn("Error stopping camera:", cameraError);
        }
      }

      this._stopLiveScanningMode();

      if (this._cameraMonitoringInterval) {
        clearInterval(this._cameraMonitoringInterval);
        this._cameraMonitoringInterval = null;
      }

      this._clearBoundingBoxes();
      this._isVideoFrozen = false;
    } catch (e) {
      console.warn("Error in stopScanner:", e);
    } finally {
      this._closeModal();
    }
  }

  _configureCameraView() {
    try {
      if (!this.refs.scanditContainer) return;
      if (!document.getElementById('material-icons-font')){
        const link = document.createElement('link');
        link.id = 'material-icons-font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
        document.head.appendChild(link);
      }

      if (!document.getElementById('material-icons-styles')) {
        const style = document.createElement('style');
        style.id = 'material-icons-styles';
        style.textContent = `
          .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 35px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
          }
          
          #freezeButton {
            font-family: 'Material Symbols Outlined', sans-serif !important;
            font-variation-settings: 
              'FILL' 1,
              'wght' 400,
              'GRAD' 0,
              'opsz' 24;
          }
        `;
        document.head.appendChild(style);
      }

      const style = document.createElement('style');
      style.id = 'scandit-camera-responsive-styles';
      if (!document.getElementById('scandit-camera-responsive-styles')) {
        style.textContent = `
          .barcode-modal-content {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            height: 100% !important;
          }

          .scandit-container {
            position: relative !important;
            display: inline-block !important;
            background: black !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }

          .scandit-container video {
            display: block !important;
            width: auto !important;
            height: auto !important;
            max-width: 90vw !important;
            max-height: 80vh !important;
          }

          .scandit-container > div {
            position: relative !important;
            display: inline-block !important;
          }

          @media (max-width: 768px) {
            .scandit-container video {
              max-width: 95vw !important;
              max-height: 75vh !important;
            }
          }

          @supports (-webkit-touch-callout: none) {
            .scandit-container video {
              transform: translateZ(0) !important;
              -webkit-transform: translateZ(0) !important;
            }
          }
        `;
        document.head.appendChild(style);
      }

      this.refs.scanditContainer.classList.add('scandit-container');

      if (this.refs.modalContainer) {
        this.refs.modalContainer.classList.add('barcode-modal-content');
      }

      this._startCameraMonitoring();
    } catch (error) {}
  }

  _startCameraMonitoring() {
    this._cameraMonitoringInterval = setInterval(() => {
      this._checkAndResizeCamera();
    }, 200);

    this._checkAndResizeCamera();
  }

  _checkAndResizeCamera() {
    try {
      const video = this.refs.scanditContainer?.querySelector('video');
      if (!video) return;

      if (video.videoWidth && video.videoHeight) {
        const videoRect = video.getBoundingClientRect();

        if (videoRect.width > 0 && videoRect.height > 0) {
          this._sizeContainerToCamera(video, videoRect);
        }
      }
    } catch (error) {}
  }

  _sizeContainerToCamera(video, videoRect = null) {
    try {
      if (!video) return;

      const videoWidth = video.videoWidth || 640;
      const videoHeight = video.videoHeight || 480;

      const displayRect = videoRect || video.getBoundingClientRect();
      const displayWidth = displayRect.width;
      const displayHeight = displayRect.height;

      let containerWidth, containerHeight;

      if (displayWidth > 0 && displayHeight > 0) {
        containerWidth = Math.round(displayWidth);
        containerHeight = Math.round(displayHeight);
      } else {
        const videoAspectRatio = videoWidth / videoHeight;
        const maxWidth = Math.min(window.innerWidth * 0.9, 1200);
        const maxHeight = Math.min(window.innerHeight * 0.8, 800);

        if (maxWidth / maxHeight > videoAspectRatio) {
          containerHeight = maxHeight;
          containerWidth = containerHeight * videoAspectRatio;
        } else {
          containerWidth = maxWidth;
          containerHeight = containerWidth / videoAspectRatio;
        }
      }

      const currentWidth = parseInt(this.refs.scanditContainer.style.width) || 0;
      const currentHeight = parseInt(this.refs.scanditContainer.style.height) || 0;

      if (Math.abs(currentWidth - containerWidth) > 5 || Math.abs(currentHeight - containerHeight) > 5) {
        this.refs.scanditContainer.style.width = `${containerWidth}px`;
        this.refs.scanditContainer.style.height = `${containerHeight}px`;

        if (this.refs.modalContainer) {
          this.refs.modalContainer.style.width = 'auto';
          this.refs.modalContainer.style.height = 'auto';
        }

        this._cachedScaleFactors = null;

        setTimeout(() => {
          this._resizeBoundingBoxCanvas();
        }, 50);
      }
    } catch (error) {}
  }

  _createBoundingBoxOverlay() {
    this._boundingBoxCanvas = document.createElement('canvas');
    this._boundingBoxCanvas.style.position = 'absolute';
    this._boundingBoxCanvas.style.top = '0';
    this._boundingBoxCanvas.style.left = '0';
    this._boundingBoxCanvas.style.width = '100%';
    this._boundingBoxCanvas.style.height = '100%';
    this._boundingBoxCanvas.style.pointerEvents = 'auto';
    this._boundingBoxCanvas.style.zIndex = '1000';
    this._boundingBoxCanvas.style.cursor = 'pointer';

    this._boundingBoxContext = this._boundingBoxCanvas.getContext('2d');

    this.refs.scanditContainer.appendChild(this._boundingBoxCanvas);

    this._boundingBoxCanvas.addEventListener('click', (event) => {
      this._handleBoundingBoxClick(event);
    });

    this._resizeHandler = () => {
      if (this._boundingBoxCanvas) {
        requestAnimationFrame(() => this._resizeBoundingBoxCanvas());
      }
    };

    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('orientationchange', this._resizeHandler);

    this._resizeBoundingBoxCanvas();
  }

  _drawBoundingBoxes(barcodes) {
    try {
      if (!this._boundingBoxContext || !this._boundingBoxCanvas) {
        return;
      }

      if (this._animationFrameId) {
        cancelAnimationFrame(this._animationFrameId);
        this._animationFrameId = null;
      }

      const draw = () => {
        try {
          if (!this._boundingBoxContext || !this._boundingBoxCanvas) {
            return;
          }

          let trackedBarcodes = this._trackedBarcodes || {};
          const barcodeEntries = Object.entries(trackedBarcodes);

          const width = this._boundingBoxCanvas.width;
          const height = this._boundingBoxCanvas.height;

          if (width <= 0 || height <= 0) {
            this._resizeBoundingBoxCanvas();
            this._animationFrameId = requestAnimationFrame(draw);
            return;
          }

          this._boundingBoxContext.clearRect(0, 0, width, height);

          if (!barcodeEntries.length) {
            return;
          }

          this._boundingBoxContext.font = '14px Arial';
          this._boundingBoxContext.textAlign = 'center';
          this._boundingBoxContext.textBaseline = 'bottom';

          if (!this._cachedScaleFactors) {
            const videoElement = this.refs.scanditContainer?.querySelector('video');
            const container = this.refs.scanditContainer;

            if (videoElement && videoElement.videoWidth && videoElement.videoHeight && container) {
              const containerRect = container.getBoundingClientRect();
              const containerWidth = containerRect.width;
              const containerHeight = containerRect.height;
              this._cachedScaleFactors = {
                scaleX: containerWidth / videoElement.videoWidth,
                scaleY: containerHeight / videoElement.videoHeight
              };
            } else {
              this._cachedScaleFactors = { scaleX: 1, scaleY: 1 };
            }
          }

          const { scaleX, scaleY } = this._cachedScaleFactors;

          this._clickableRegions = [];

          for (const [id, trackedBarcode] of barcodeEntries) {
            let anchor = trackedBarcode._anchorPositions || trackedBarcode._location || (trackedBarcode.barcode && trackedBarcode.barcode.location);
            if (!anchor || !anchor.topLeft) continue;
            const { topLeft, topRight, bottomRight, bottomLeft } = anchor;
            const x1 = topLeft.x * scaleX;
            const y1 = topLeft.y * scaleY;
            const x2 = topRight.x * scaleX;
            const y2 = topRight.y * scaleY;
            const x3 = bottomRight.x * scaleX;
            const y3 = bottomRight.y * scaleY;
            const x4 = bottomLeft.x * scaleX;
            const y4 = bottomLeft.y * scaleY;

            if (this._isVideoFrozen) {
              this._boundingBoxContext.save();
              this._boundingBoxContext.strokeStyle = 'rgba(1, 255, 255, 1)';
              this._boundingBoxContext.fillStyle = 'rgba(1, 255, 255, 0.7)';
              this._boundingBoxContext.lineWidth = 3;
              this._boundingBoxContext.beginPath();
              this._boundingBoxContext.moveTo(x1, y1);
              this._boundingBoxContext.lineTo(x2, y2);
              this._boundingBoxContext.lineTo(x3, y3);
              this._boundingBoxContext.lineTo(x4, y4);
              this._boundingBoxContext.closePath();
              this._boundingBoxContext.stroke();
              this._boundingBoxContext.restore();
            }

            const text = `${trackedBarcode.barcode?.symbology || ''}: ${trackedBarcode.barcode?.data || ''}`;
            const textMetrics = this._boundingBoxContext.measureText(text);
            const textX = x1;
            const textY = y1 - 25;
            this._boundingBoxContext.save();
            this._boundingBoxContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this._boundingBoxContext.fillRect(textX - 2, textY - 2, textMetrics.width + 20, 20);
            this._boundingBoxContext.fillStyle = '#fff';
            this._boundingBoxContext.font = 'bold 15px Arial';
            this._boundingBoxContext.textAlign = 'left';
            this._boundingBoxContext.textBaseline = 'top';
            this._boundingBoxContext.fillText(text, textX, textY + 2);
            this._boundingBoxContext.restore();

            this._clickableRegions.push({
              barcode: trackedBarcode.barcode,
              region: [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x: x3, y: y3 },
                { x: x4, y: y4 }
              ]
            });
          }
        } catch (error) {
          console.error("Error in drawing frame:", error);
        }
        this._animationFrameId = requestAnimationFrame(draw);
      };
      this._animationFrameId = requestAnimationFrame(draw);
    } catch (error) {
      console.error("Error drawing bounding boxes:", error);
    }
  }

  _handleBoundingBoxClick(event) {
    if (!this._currentBarcodes || this._currentBarcodes.length === 0 || !this._clickableRegions) return;

    const rect = this._boundingBoxCanvas.getBoundingClientRect();
    const clickX = (event.clientX - rect.left);
    const clickY = (event.clientY - rect.top);

    for (const regionObj of this._clickableRegions) {
      const region = regionObj.region;
      if (this._isPointInBoundingBox(clickX, clickY, ...region)) {
        const barcode = regionObj.barcode;
        this.setValue(barcode.data);
        if (this.refs.barcode) {
          this.refs.barcode.value = barcode.data;
        }
        this.validateAndSetDirty();
        this.stopScanner();
        break;
      }
    }
  }

  _configureAdvancedSymbologySettings(settings) {
    try {
      try {
        const code39Settings = settings.settingsForSymbology(Symbology.Code39);
        if (code39Settings && typeof code39Settings.checksumType !== 'undefined') {
          code39Settings.checksumType = 'mod43';
        }
      } catch (e) {
        console.warn("Code39 config failed:", e);
      }
    } catch (error) {
      console.warn("Error in advanced symbology configuration:", error);
    }
  }

  _closeModal() {
    if (!this.refs.quaggaModal) {
      console.warn("Cannot close modal: quaggaModal ref not found");
      return;
    }

    try {
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

      this.refs.quaggaModal.style.display = "none";
      this.refs.quaggaModal.style.visibility = "hidden";
      this.refs.quaggaModal.style.pointerEvents = "none";
      this.refs.quaggaModal.style.opacity = "0";
    } catch (error) {
      console.warn("Error closing modal (handled):", error);
      try {
        if (this.refs.quaggaModal) {
          this.refs.quaggaModal.style.display = "none";
        }
      } catch (e) {
        console.warn("Critical error closing modal (handled):", e);
      }
    }
  }

  _openModal() {
    if (!this.refs.quaggaModal) {
      console.warn("Modal reference is null, cannot open modal.");
      return;
    }

    try {
      this.refs.quaggaModal.classList.remove('barcode-modal-hidden', 'barcode-modal-closing');
      this.refs.quaggaModal.style.visibility = "visible";
      this.refs.quaggaModal.style.pointerEvents = "auto";
      this.refs.quaggaModal.style.opacity = "1";
      this.refs.quaggaModal.style.display = "flex";
    } catch (error) {
      console.warn("Error opening modal:", error);
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

  _isPointInBoundingBox(x, y, topLeft, topRight, bottomRight, bottomLeft) {
    const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const maxX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
    const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
    const maxY = Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);

    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  _startLiveScanningMode() {
    if (this._liveScanInterval) {
      clearInterval(this._liveScanInterval);
    }

    this._liveScanInterval = setInterval(() => {
      if (!this._isVideoFrozen && this._boundingBoxContext) {
        if (!this._lastBarcodeTime || Date.now() - this._lastBarcodeTime > 100) {
        }
      }
    }, 50);
  }

  _stopLiveScanningMode() {
    if (this._liveScanInterval) {
      clearInterval(this._liveScanInterval);
      this._liveScanInterval = null;
    }
  }

  detach() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    this._stopLiveScanningMode();

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      window.removeEventListener('orientationchange', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this._unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._unhandledRejectionHandler);
      this._unhandledRejectionHandler = null;
    }

    if (this._boundingBoxCanvas && this._boundingBoxCanvas.parentNode) {
      this._boundingBoxCanvas.parentNode.removeChild(this._boundingBoxCanvas);
      this._boundingBoxCanvas = null;
      this._boundingBoxContext = null;
    }

    return super.detach();
  }

  destroy() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

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

    if (this._cameraResizeObserver) {
      this._cameraResizeObserver.disconnect();
      this._cameraResizeObserver = null;
    }

    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }

    if (this._continuousTrackingInterval) {
      clearInterval(this._continuousTrackingInterval);
      this._continuousTrackingInterval = null;
    }

    if (this._cameraMonitoringInterval) {
      clearInterval(this._cameraMonitoringInterval);
      this._cameraMonitoringInterval = null;
    }

    if (this._unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._unhandledRejectionHandler);
      this._unhandledRejectionHandler = null;
    }

    this._barcodeBatch = null;
    this._barcodeCapture = null;
    this._camera = null;
    this._dataCaptureView = null;

    return super.destroy();
  }

  setValue(value, flags = {}) {
    const changed = super.setValue(value);
    this.redraw();
    return changed;
  }

  get defaultSchema() {
    return BarcodeScanner.schema();
  }


  setCustomValidity(errors, dirty = false) {
    const isClearing =
      errors === undefined ||
      errors === null ||
      errors === "" ||
      (Array.isArray(errors) && errors.length === 0);
    const allowClear = this._allowErrorClear || this._manualErrors.length === 0;

      if (this._manualErrors.length) {
        super.setCustomValidity(this._manualErrors, dirty);
      }
      return;
    }

    if (isClearing && allowClear) {
      this._manualErrors = [];
    }

    if (!isClearing) {
      this._manualErrors = Array.isArray(errors)
        ? [...errors]
        : errors
        ? [errors]
        : [];
    }

    super.setCustomValidity(errors, dirty);
  }


  _areErrorsEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

    if (isClearing && !allowClear) {
}
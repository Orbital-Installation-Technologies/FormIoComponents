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
  configure,
  OverrideState
} from "@scandit/web-datacapture-core";

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
        allowMultipleBarcodes: false, // Allow multiple barcodes to be scanned
        backupBarcodeField: "", // Optional: field to store ALL detected barcodes as backup
        imageUploadField: "", // Optional: field name of file upload component to send barcode image
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

  static editForm(...extend) {
    return BarcodeScannerEditForm(...extend);
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
    this._autoFreezeTimeout = null;
    this._showingConfirmation = false;
    this._confirmingBarcode = false; // Prevent re-entry into barcode confirmation
    this._torchEnabled = false; // Track torch/flashlight state independently from camera state
    this._pendingBarcodes = []; // All detected barcodes waiting for confirmation
    this._selectedBarcodeIndices = new Set(); // For tracking radio selections
    this._barcodeImages = {}; // Store barcode images by their data value
    this._allDetectedBarcodes = []; // Store ALL barcodes for backup field
    this._lastFrameTime = 0; // Throttle frame processing
    this._lastDrawTime = 0; // Throttle bounding box drawing
    this._frameThrottleMs = 100; // Process frames max once per 100ms
    this._drawThrottleMs = 50; // Draw bounding boxes max once per 50ms
    this._containerResizeObserver = null; // Reconnect view when container gets size (hardware form first open)

    // License key can come from (in priority order):
    // 1. Component configuration (scanditLicenseKey set in Formio builder)
    // 2. Component data (scanditLicenseKey property)
    // 3. Window global (set by host app e.g. Next.js formio-init so NEXT_PUBLIC_* is inlined)
    // 4. Environment variable (NEXT_PUBLIC_SCANDIT_KEY - when bundled with env replacement)
    let envKey;
    if (this.component && this.component.scanditLicenseKey) {
      envKey = this.component.scanditLicenseKey;
    } else if (this.data && this.data.scanditLicenseKey) {
      envKey = this.data.scanditLicenseKey;
    } else if (typeof process !== 'undefined' && process?.env && process.env.NEXT_PUBLIC_SCANDIT_KEY) {
      envKey = process?.env?.NEXT_PUBLIC_SCANDIT_KEY;
    }
    this._licenseKey = envKey || 'undefined' 
  }



  init() {
    super.init();
  }

  render() {
    const cameraSVG = `<i class="fa fa-camera bi bi-camera" aria-hidden="true"></i>`;

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

    // Add styles for confirmation dialog animations
    if (!document.getElementById('barcode-confirmation-styles')) {
      const style = document.createElement('style');
      style.id = 'barcode-confirmation-styles';
      style.textContent = `
        @keyframes slideUp {
          from {
            transform: translate(-50%, -40%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%);
            opacity: 1;
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .barcode-confirmation-dialog {
          animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @media (max-width: 480px) {
          [ref="confirmationDialog"] {
            padding: 24px !important;
            max-width: 95vw !important;
          }
          [ref="confirmButton"],
          [ref="rescanButton"] {
            padding: 12px 16px !important;
            font-size: 14px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    return super.render(`
      <div style="display:block; position:relative; gap:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:nowrap; margin-bottom:8px;">
          <input
            ref="barcode"
            type="text"
            class="form-control"
            value="${this.dataValue || ""}"
            placeholder="Scan or enter barcode"
            style="flex-grow:1; margin-right:10px; min-width:0;"
          />
          <button ref="scanButton" type="button" class="btn btn-primary" style="margin-right:5px; flex-shrink:0; padding:6px 12px; display:flex; align-items:center; justify-content:center; min-width:40px;" title="Open camera to scan">
            <span style="display:flex; align-items:center; justify-content:center; width:20px; height:20px;">
              ${cameraSVG}
            </span>
          </button>
        </div>

        <div ref="quaggaModal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:1000; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; overflow:hidden;">
          <div ref="modalContainer" style="position:relative; background:black; border-radius:12px; overflow:visible; display:flex; flex-direction:column; max-width:100%; max-height:100%; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
            <button ref="closeModal" style="position:absolute; top:12px; right:12px; z-index:10000; background:rgba(255,255,255,0.95); border:none; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:bold; cursor:pointer; pointer-events:auto; box-shadow:0 2px 8px rgba(0,0,0,0.3); transition:background 0.2s ease;" title="Close">×</button>

            <!-- Instructions Overlay -->
            <div ref="scannerInstructions" style="position:absolute; top:0; left:0; right:0; background:linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%); z-index:100; padding:16px 20px; color:white; text-align:center; font-size:14px; pointer-events:none;">
              <div style="font-weight:500;">Point camera at barcode</div>
            </div>

            <div
              ref="scanditContainer"
              style="
                position: relative;
                background: black;
                overflow: hidden;
                min-width: 320px;
                min-height: 240px;
                display: flex;
                align-items: center;
                justify-content: center;
              ">
              <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:rgba(255,255,255,0.4); pointer-events:none; z-index:5;">
                <div style="font-size:32px; margin-bottom:8px;">📱</div>
                <div style="font-size:12px;">Loading camera...</div>
              </div>
            </div>

            <!-- Flashlight Button (Bottom-Left) -->
           <!-- <button
              ref="flashlightButton"
              type="button"
              style="
                position: absolute;
                bottom: 20px;
                left: 20px;
                z-index: 9999;
                background: rgba(255, 255, 255, 0.2);
                color: white;
                border: 2px solid rgba(255, 255, 255, 0.5);
                border-radius: 8px;
                width: 50px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                font-family: Arial, sans-serif;
              "
              title="Toggle camera flash (for dark environments)"
              onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'; this.style.boxShadow='0 4px 16px rgba(255, 255, 200, 0.4)'"
              onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.3)'">
              ⚡
            </button>-->

            <!-- Freeze Button (Bottom-Right) - Always visible during scan -->
            <button
              ref="freezeButton"
              type="button"
              style="
                position: absolute;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                background: rgba(255, 255, 255, 0.2);
                color: white;
                border: 2px solid rgba(255, 255, 255, 0.5);
                border-radius: 8px;
                width: 50px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                font-family: Arial, sans-serif;
              "
              title="Pause camera to check barcode"
              onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'; this.style.boxShadow='0 4px 16px rgba(100, 200, 255, 0.4)'"
              onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.3)'">
              ⏸
            </button>

          <!-- Confirmation Dialog -->
          <div ref="confirmationDialog" style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 16px;
            padding: 32px 28px;
            max-width: 550px;
            width: 95%;
            min-width: 300px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            z-index: 10001;
            display: none;
            flex-direction: column;
            gap: 0;
            animation: slideUp 0.3s ease-out;
          ">

            <!-- Single Mode Content -->
            <div ref="singleModeContent" style="display: none; width: 100%; box-sizing: border-box; flex-direction: column; flex: 1;">
              <div style="text-align:center; margin-bottom: 20px;">
                <h3 style="margin:0 0 6px 0; font-size:24px; font-weight:700; color:#1a1a1a;">Confirm Barcode</h3>
                <p style="margin:0; font-size:13px; color:#999;">Please verify the scanned data</p>
              </div>

              <div style="margin-bottom: 16px; width: 100%; box-sizing: border-box;">
                <div ref="barcodeDataDisplay" style="
                  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
                  border: 3px solid #007bff;
                  border-radius: 12px;
                  padding: 20px 16px;
                  font-family: 'Courier New', monospace;
                  font-size: 18px;
                  font-weight: 600;
                  word-break: break-all;
                  color: #007bff;
                  text-align: center;
                  min-height: 60px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 100%;
                  box-sizing: border-box;
                "></div>
              </div>

              <div style="margin-bottom: 24px; width: 100%; box-sizing: border-box;">
                <div ref="barcodeTypeDisplay" style="
                  font-size: 13px;
                  color: #666;
                  text-align: center;
                  background: #f0f7ff;
                  padding: 10px 12px;
                  border-radius: 8px;
                  border: 1px solid #d0e8ff;
                  width: 100%;
                  box-sizing: border-box;
                "></div>
              </div>

              <div style="display:flex; gap:12px; flex-direction:column; width: 100%; box-sizing: border-box;">
                <button ref="confirmButton" style="
                  background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                  color: white;
                  border: none;
                  border-radius: 10px;
                  padding: 16px 24px;
                  font-size: 16px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                  width: 100%;
                  box-sizing: border-box;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0, 123, 255, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0, 123, 255, 0.3)'">
                  ✓ Confirm Barcode
                </button>
                <button ref="rescanButton" style="
                  background: #f5f5f5;
                  color: #333;
                  border: 2px solid #ddd;
                  border-radius: 10px;
                  padding: 14px 24px;
                  font-size: 16px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  width: 100%;
                  box-sizing: border-box;
                " onmouseover="this.style.background='#e8e8e8'; this.style.borderColor='#999'" onmouseout="this.style.background='#f5f5f5'; this.style.borderColor='#ddd'">
                  ✕ Rescan
                </button>
              </div>
            </div>

            <!-- Multi-Select Mode Content -->
            <div ref="multiSelectModeContent" style="display: none; width: 100%; box-sizing: border-box; flex-direction: column; flex: 1;">
              <div style="text-align:center; margin-bottom: 20px;">
                <h3 style="margin:0 0 6px 0; font-size:24px; font-weight:700; color:#1a1a1a;">Select Barcode</h3>
                <p ref="multiSelectCount" style="margin:0; font-size:13px; color:#999;"></p>
              </div>

              <div style="margin-bottom: 20px; width: 100%; box-sizing: border-box;">
                <div ref="barcodeListContainer" style="
                  max-height: 320px;
                  overflow-y: auto;
                  border: 2px solid #e0e0e0;
                  border-radius: 10px;
                  display: flex;
                  flex-direction: column;
                  background: #f8f9fa;
                  width: 100%;
                  box-sizing: border-box;
                "></div>
              </div>

              <div style="display:flex; gap:12px; flex-direction:column; width: 100%; box-sizing: border-box;">
                <button ref="multiConfirmButton" style="
                  background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
                  color: white;
                  border: none;
                  border-radius: 10px;
                  padding: 16px 24px;
                  font-size: 16px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                  width: 100%;
                  box-sizing: border-box;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(40, 167, 69, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(40, 167, 69, 0.3)'">
                  ✓ Confirm Selection
                </button>
                <button ref="multiRescanButton" style="
                  background: #f5f5f5;
                  color: #333;
                  border: 2px solid #ddd;
                  border-radius: 10px;
                  padding: 14px 24px;
                  font-size: 16px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  width: 100%;
                  box-sizing: border-box;
                " onmouseover="this.style.background='#e8e8e8'; this.style.borderColor='#999'" onmouseout="this.style.background='#f5f5f5'; this.style.borderColor='#ddd'">
                  ✕ Rescan
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
      </div>
    `);
  }

  validateAndSetDirty() {
    const valid = this.checkValidity(this.data, true);
    if (!valid) {
      setTimeout(() => {
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

  /**
   * Reconnect Scandit view and overlay to current refs.scanditContainer after DOM/refs update.
   * Call after redraw or attach when we have an active scanner to fix black screen.
   */
  async _reconnectScannerViewIfNeeded() {
    if (!this._dataCaptureContext || !this._dataCaptureView || !this.refs?.scanditContainer) return;
    try {
      await this._waitForContainerReady();
      this._dataCaptureView.connectToElement(this.refs.scanditContainer);
      const containerHasCanvas = this._boundingBoxCanvas && this.refs.scanditContainer.contains(this._boundingBoxCanvas);
      if (!containerHasCanvas) {
        this._createBoundingBoxOverlay();
      } else {
        this._resizeBoundingBoxCanvas();
      }
      this._startCameraMonitoring();
      this._drawBoundingBoxes(this._currentBarcodes || []);
    } catch (err) {
      console.warn('BarcodeScanner: error reconnecting view:', err);
    }
  }

  /**
   * When any form value changes, Form.io can call redraw() which replaces our DOM.
   * The Scandit view stays connected to the old (detached) container → black screen.
   * Reconnect the view and overlay to the new container whenever we have an active scanner.
   */
  redraw() {
    const hadActiveScanner = !!(this._dataCaptureContext && this._dataCaptureView);
    const result = super.redraw();
    if (hadActiveScanner) {
      requestAnimationFrame(() => this._reconnectScannerViewIfNeeded());
    }
    return result;
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
      confirmationDialog: "single",
      // Single barcode mode refs
      singleModeContent: "single",
      confirmButton: "single",
      rescanButton: "single",
      barcodeDataDisplay: "single",
      barcodeTypeDisplay: "single",
      // Multiple barcodes mode refs
      multiSelectModeContent: "single",
      barcodeListContainer: "single",
      multiSelectCount: "single",
      multiConfirmButton: "single",
      multiRescanButton: "single",
      // Common refs
      scannerInstructions: "single",
      // Flashlight and Freeze refs
      // flashlightButton: "single",
      freezeButton: "single",
    });

    if (
      !this.refs.barcode ||
      !this.refs.scanButton ||
      !this.refs.quaggaModal ||
      !this.refs.scanditContainer ||
      !this.refs.closeModal ||
      !this.refs.confirmationDialog ||
      !this.refs.confirmButton ||
      !this.refs.rescanButton
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
          if (window.ReactNativeWebView && this._torchEnabled === true) {
            window.ReactNativeWebView.postMessage('FLASH_OFF');
            this._torchEnabled = false;
          }
          await this.stopScanner();
          this._lastCodes = [];
          this._isVideoFrozen = false;
        } catch (error) {
          console.warn("Error in close button handler (handled):", error);
          try {
            await this._releaseScannerResources();
          } catch (releaseErr) {
            console.warn("Error releasing scanner resources:", releaseErr);
          }
          this._closeModal();
        }
      });

      // Single mode listeners
      this.refs.confirmButton.addEventListener("click", () => {
        this._confirmBarcode();
      });

      this.refs.rescanButton.addEventListener("click", async () => {
        await this._rescanBarcode();
      });

      // Multi-select mode listeners
      this.refs.multiConfirmButton.addEventListener("click", () => {
        this._confirmMultiSelect();
      });

      this.refs.multiRescanButton.addEventListener("click", async () => {
        await this._rescanBarcode();
      });

      // Clear All button listener
      if (this.refs.clearAllButton) {
        this.refs.clearAllButton.addEventListener("click", () => {
          this._clearAllBarcodes();
        });
      }

      // Flashlight button listeners
    /*  if (this.refs.flashlightButton) {
        this.refs.flashlightButton.addEventListener("click", () => {
          this._toggleFlashlight();
        });
      }*/

      // Freeze button listener
      if (this.refs.freezeButton) {
        this.refs.freezeButton.addEventListener("click", () => {
          this._manualFreeze();
        });
      }

      // Update preview on initial load
      this._updateBarcodePreview();
    }

    if (this._dataCaptureContext && this._dataCaptureView) {
      requestAnimationFrame(() => this._reconnectScannerViewIfNeeded());
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

  /**
   * Wait for the scanner container to have non-zero size so Scandit view connects correctly.
   * Fixes black screen on first open when the modal/container isn't laid out yet (e.g. hardware form).
   */
  async _waitForContainerReady() {
    const container = this.refs?.scanditContainer;
    if (!container) return;
    const maxWait = 1500;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const rect = container.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) return;
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  /**
   * If the container gets non-zero size after we already connected (e.g. hardware form first open),
   * reconnect the view so the camera feed appears instead of staying black.
   */
  _observeContainerResizeOnce() {
    const container = this.refs?.scanditContainer;
    if (!container || !this._dataCaptureView || !this._dataCaptureContext) return;
    const rect = container.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return;
    const observer = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) return;
      observer.disconnect();
      this._containerResizeObserver = null;
      try {
        this._dataCaptureView.connectToElement(container);
        if (!this._boundingBoxCanvas || !container.contains(this._boundingBoxCanvas)) {
          this._createBoundingBoxOverlay();
        } else {
          this._resizeBoundingBoxCanvas();
        }
        this._startCameraMonitoring();
        this._drawBoundingBoxes(this._currentBarcodes || []);
      } catch (err) {
        console.warn('BarcodeScanner: error reconnecting on container resize:', err);
      }
    });
    this._containerResizeObserver = observer;
    observer.observe(container);
  }

  async openScanditModal() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    // Clear any pending auto-freeze
    if (this._autoFreezeTimeout) {
      clearTimeout(this._autoFreezeTimeout);
      this._autoFreezeTimeout = null;
    }

    // Always release any existing scanner state so we get a fresh camera and context.
    // Fixes frozen view when reopening after switching forms (e.g. VIN -> hardware -> back to VIN).
    await this._releaseScannerResources();

    this._openModal();
    this._lastCodes = [];
    this._isVideoFrozen = false;
    this._showingConfirmation = false;
    this._confirmingBarcode = false;
    this._pendingBarcodes = [];
    this._selectedBarcodeIndices.clear();
    this._autoFreezeTimeout = null; // Clear any existing timeout

    // Hide confirmation dialog on modal open
    if (this.refs.confirmationDialog) {
      this.refs.confirmationDialog.style.display = 'none';
      this.refs.confirmationDialog.style.opacity = '1';
    }

    if (this._uploadedImageElement && this._uploadedImageElement.parentNode) {
      this._uploadedImageElement.parentNode.removeChild(this._uploadedImageElement);
      this._uploadedImageElement = null;
    }

    const video = this.refs.scanditContainer.querySelector('video');
    if (video) video.style.display = '';

    // Hide freeze button on modal open - will show when barcodes detected
    if (this.refs.freezeButton) {
      this.refs.freezeButton.style.display = 'none';
      this.refs.freezeButton.innerHTML = '⏸';
      this.refs.freezeButton.style.background = 'rgba(255, 255, 255, 0.2)';
    }

    try {
      // Give the modal two frames to lay out (helps hardware form / tabs where container is 0-sized at first)
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      // Wait for container to have dimensions so first open on hardware form (or after value change) isn't black
      await this._waitForContainerReady();
      // After release above, _dataCaptureContext is always null so we always do full init
      await this._initializeScandit();
      if (this._dataCaptureContext) {
        await this._setupCamera();
        // If container was still 0-sized (e.g. hardware form first open), reconnect when it gets size
        this._observeContainerResizeOnce();
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
                libraryLocation: "/scandit-lib/",
                moduleLoaders: [barcodeCaptureLoader()],
                // Disable SIMD/multithreading to avoid worker error "Uncaught 71695768" when
                // the page is not crossOriginIsolated (no COOP/COEP headers).
                overrideSimdSupport: OverrideState.Off,
                overrideThreadsSupport: OverrideState.Off
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

        // Performance optimization: Filter duplicate barcodes within 300ms
        settings.codeDuplicateFilter = 300;

        if (settings.locationSelection) {
            settings.locationSelection = null;
        }

        // Performance optimization: Limit codes per frame to reduce processing
        if (typeof settings.maxNumberOfCodesPerFrame !== 'undefined') {
            settings.maxNumberOfCodesPerFrame = 5;
        }

        // Performance optimization: Enable battery saving mode
        if (typeof settings.batterySaving !== 'undefined') {
            settings.batterySaving = true;
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
                // Performance optimization: Throttle frame processing
                const now = Date.now();
                if (now - this._lastFrameTime < this._frameThrottleMs) {
                  return; // Skip this frame if too soon
                }
                this._lastFrameTime = now;
                
                this._trackedBarcodes = session.trackedBarcodes || {};
                const barcodes = Object.values(this._trackedBarcodes).map(tb => tb.barcode);
                this._currentBarcodes = barcodes;
                
                // Performance optimization: Throttle bounding box drawing
                const drawNow = Date.now();
                if (drawNow - this._lastDrawTime >= this._drawThrottleMs) {
                  this._lastDrawTime = drawNow;
                  this._drawBoundingBoxes(this._currentBarcodes);
                }

                // Trigger auto-freeze and confirmation when barcode is detected
                if (barcodes.length > 0 && !this._isVideoFrozen && !this._showingConfirmation) {
                    if (window.ReactNativeWebView && this._torchEnabled === true) {
                        window.ReactNativeWebView.postMessage('FLASH_OFF');
                        this._torchEnabled = false;
                    }
                    // --- NEW: Capture the video frame and crop barcodes ---
                    const video = this.refs.scanditContainer?.querySelector('video');
        
                    if (video && video.videoWidth > 0 && video.videoHeight > 0 && barcodes.length > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                      
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        this._canvas = canvas;
                        this._captureBarcodeImage(barcodes, this._canvas);
                    } else {
                        console.log('Video not ready yet or no barcodes detected.');
                    }
                    this._autoFreezeAndConfirm();
                }  
  
            },
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
        
        // Performance optimization: Use lower resolution on mobile devices
        if (typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          // Prefer lower resolution to reduce processing load
          if (cameraSettings.preferredResolution) {
            cameraSettings.preferredResolution = 'p480';
          }
        }
        
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
            const rnWebView = typeof window !== 'undefined' ? window.ReactNativeWebView : null;
            const canPost = rnWebView && typeof rnWebView.postMessage === 'function';

            if (canPost) {
              rnWebView.postMessage('cameraAccessDenied');
            } else {
              // Web fallback: show something actionable instead of leaving "Loading camera..."
                this.refs.scanditContainer.textContent =
                 'Camera access denied. Please enable camera permissions in your browser settings and try again.';
            }
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

  _autoFreezeAndConfirm() {
    // NOTE: We don't return here if _showingConfirmation is true because the barcode listener
    // already checks !this._showingConfirmation before calling this function

    // Get detected barcodes
    let detectedBarcodes = [];

    if (this._usingBatch && this._trackedBarcodes) {
      const barcodes = Object.values(this._trackedBarcodes);
      if (barcodes.length > 0) {
        detectedBarcodes = barcodes.map(tb => tb.barcode);
      }
    }


    if (detectedBarcodes.length === 0) {
      return;
    }


    // Show freeze button when barcodes detected
    if (this.refs.freezeButton) {
      this.refs.freezeButton.style.display = 'flex';
      this.refs.freezeButton.innerHTML = '⏸'; // Pause icon
      this.refs.freezeButton.style.background = 'rgba(255, 255, 255, 0.2)';
      this.refs.freezeButton.title = 'Freeze camera (or wait for auto-freeze)';
    } else {
    }

    // DON'T reset the timeout if it's already running!
    // The barcode listener fires repeatedly, so we only want the FIRST timeout to run
    if (this._autoFreezeTimeout) {
      return;
    }

    // If multiple barcodes, wait longer for more to be detected (2 seconds)
    // If single barcode, freeze faster (1.2 seconds)
    const delayTime = detectedBarcodes.length > 1 ? 2000 : 1200;

    // Set a timeout to auto-freeze after stable detection
    this._autoFreezeTimeout = setTimeout(() => {
      this._autoFreezeTimeout = null;

      if (this._trackedBarcodes && Object.values(this._trackedBarcodes).length > 0) {
        this._isVideoFrozen = true;

        if (this._camera) {
          this._camera.switchToDesiredState(FrameSourceState.Off);
        }

        // Get the barcodes and show appropriate confirmation dialog
        const detectedBarcodes = Object.values(this._trackedBarcodes).map(tb => tb.barcode);
        this._showConfirmationDialog(detectedBarcodes);
      } else {
      }
    }, delayTime);
  }

  _showConfirmationDialog(barcodes, preSelectedBarcode = null) {

    if (!barcodes || barcodes.length === 0) {
      return;
    }

    // Hide freeze button when confirmation dialog shown
    if (this.refs.freezeButton) {
      this.refs.freezeButton.style.display = 'none';
    }

    // Store ALL detected barcodes for backup field
    this._allDetectedBarcodes = barcodes.map(b => b.data);

    this._showingConfirmation = true;
    this._pendingBarcodes = barcodes;

    // Store pre-selected barcode if provided
    if (preSelectedBarcode) {
      this._preSelectedBarcode = preSelectedBarcode;
    }

    // Show confirmation dialog for both single and multiple barcodes
    // User can verify and has option to rescan

    if (!this.refs.confirmationDialog) {
      return;
    }


    if (barcodes.length === 1) {
      // Single barcode - show single mode dialog with Confirm/Rescan buttons

      // Hide all mode contents
      this.refs.singleModeContent.style.display = 'none';
      this.refs.multiSelectModeContent.style.display = 'none';

      // Show single mode dialog
      this._showSingleBarcodeDialog(barcodes[0]);

      // Show dialog with small delay to ensure modal is fully rendered
      setTimeout(() => {
        this.refs.confirmationDialog.style.display = 'flex';

        // Fade in animation
        this.refs.confirmationDialog.style.opacity = '0';
        setTimeout(() => {
          this.refs.confirmationDialog.style.transition = 'opacity 0.3s ease-out';
          this.refs.confirmationDialog.style.opacity = '1';
        }, 10);
      }, 50);
    } else {
      // Multiple barcodes detected - show dialog for selection

      // Hide all mode contents
      this.refs.singleModeContent.style.display = 'none';
      this.refs.multiSelectModeContent.style.display = 'none';

      // Show multi-select dialog
      this._showMultiSelectDialog(barcodes);

      // Show dialog with small delay to ensure modal is fully rendered
      setTimeout(() => {
        this.refs.confirmationDialog.style.display = 'flex';

        // Fade in animation
        this.refs.confirmationDialog.style.opacity = '0';
        setTimeout(() => {
          this.refs.confirmationDialog.style.transition = 'opacity 0.3s ease-out';
          this.refs.confirmationDialog.style.opacity = '1';
        }, 10);
      }, 50);
    }
  }

  _showSingleBarcodeDialog(barcode) {
    if (!this.refs.singleModeContent || !this.refs.barcodeDataDisplay || !this.refs.barcodeTypeDisplay) {
      return;
    }


    // Show the single mode content
    this.refs.singleModeContent.style.display = 'flex';
    this.refs.singleModeContent.style.flexDirection = 'column';

    // Display barcode data
    this.refs.barcodeDataDisplay.textContent = barcode.data;

    // Display barcode type/format
    const barcodeType = barcode.symbology || 'Unknown';
    this.refs.barcodeTypeDisplay.textContent = `Format: ${barcodeType}`;
  }

  _showMultiSelectDialog(barcodes) {
    if (!this.refs.multiSelectModeContent) {
      return;
    }

    // Clear previous radio buttons
    this.refs.barcodeListContainer.innerHTML = '';
    this._selectedBarcodeIndices.clear();

    // Determine which barcode should be selected
    let selectedIndex = 0;
    if (this._preSelectedBarcode) {
      // Find the index of the pre-selected barcode
      selectedIndex = barcodes.findIndex(b => b.data === this._preSelectedBarcode.data);
      if (selectedIndex === -1) {
        selectedIndex = 0; // Fallback to first if not found
      }
      this._preSelectedBarcode = null; // Clear for next time
    }

    // Select the determined barcode
    this._selectedBarcodeIndices.add(selectedIndex);

    // Create radio button for each barcode
    barcodes.forEach((barcode, index) => {
      const label = document.createElement('label');
      const isSelected = index === selectedIndex;
      label.style.cssText = `
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
        transition: background 0.2s ease;
        ${isSelected ? 'background: #e8f4fd;' : 'background: transparent;'}
        border-left: 3px solid ${isSelected ? '#007bff' : 'transparent'};
      `;

      // Update label background on hover and selection
      const updateLabelStyle = (selected) => {
        label.style.background = selected ? '#e8f4fd' : '#f9f9f9';
        label.style.borderLeft = selected ? '3px solid #007bff' : '3px solid transparent';
      };

      label.onmouseover = () => {
        if (!this._selectedBarcodeIndices.has(index)) {
          label.style.background = '#f9f9f9';
        }
      };
      label.onmouseout = () => {
        if (!this._selectedBarcodeIndices.has(index)) {
          label.style.background = 'transparent';
        }
      };

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'barcode-selection'; // All radios share the same name for single selection
      radio.checked = isSelected; // First selected by default
      radio.value = barcode.data ;
      radio.style.cssText = 'margin-right: 12px; cursor: pointer; width: 18px; height: 18px;';
      radio.onchange = (e) => {
        if (e.target.checked) {
          // Clear previous selection and select only this one
          this._selectedBarcodeIndices.clear();
          this._selectedBarcodeIndices.add(index);

          // Update visual styles for all labels
          Array.from(this.refs.barcodeListContainer.querySelectorAll('label')).forEach((lbl, i) => {
            if (i === index) {
              lbl.style.background = '#e8f4fd';
              lbl.style.borderLeft = '3px solid #007bff';
            } else {
              lbl.style.background = 'transparent';
              lbl.style.borderLeft = '3px solid transparent';
            }
          });
        }
      };

      // Also allow clicking anywhere in the label to select
      label.addEventListener('click', () => {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const dataDisplay = document.createElement('div');
      dataDisplay.style.cssText = 'flex: 1; font-family: Courier New, monospace; font-size: 13px;';
      dataDisplay.innerHTML = `
        <div style="word-break: break-all; margin-bottom: 4px;">${barcode.data}</div>
        <div style="font-size: 11px; color: #999;">${barcode.symbology || 'Unknown'}</div>
      `;

      label.appendChild(radio);
      label.appendChild(dataDisplay);
      this.refs.barcodeListContainer.appendChild(label);
    });

    // Update count
    if (this.refs.multiSelectCount) {
      this.refs.multiSelectCount.textContent = `${barcodes.length} barcode${barcodes.length !== 1 ? 's' : ''} detected`;
    }

    this.refs.multiSelectModeContent.style.display = 'flex';
    this.refs.multiSelectModeContent.style.flexDirection = 'column';
  }

  _hideConfirmationDialog() {
    if (!this.refs.confirmationDialog) {
      return;
    }

    this.refs.confirmationDialog.style.opacity = '0';
    setTimeout(() => {
      this.refs.confirmationDialog.style.display = 'none';
      this.refs.confirmationDialog.style.opacity = '1';
      this._showingConfirmation = false;
      this._pendingBarcodes = [];
    }, 300);
  }

  _confirmBarcode() {
    if (this._pendingBarcodes.length === 0) {
      return;
    }

    // Prevent re-entry
    if (this._confirmingBarcode) {
      return;
    }

    this._confirmingBarcode = true;

    // For single barcode, save just that one to main field
    const barcode = this._pendingBarcodes[0];
    this._captureBarcodeImage([barcode], this._canvas);
    this.setValue(barcode.data);
    if (this.refs.barcode) {
      this.refs.barcode.value = barcode.data;
    }
    this.validateAndSetDirty();
    this._updateBarcodePreview();

    // Send image to optional file upload field
    this._sendBarcodeImageToFileUpload(barcode.data);

    // Save ALL detected barcodes to backup field
    this._saveBackupBarcodes();

    // Close everything
    this._hideConfirmationDialog();
    setTimeout(async () => {
      try {
        if (window.ReactNativeWebView && this._torchEnabled === true) {
          window.ReactNativeWebView.postMessage('FLASH_OFF');
          this._torchEnabled = false;
        }
        await this.stopScanner();
      } finally {
        this._confirmingBarcode = false;
      }
    }, 300);
  }

  async _rescanBarcode() {
    this._hideConfirmationDialog();

    // Resume scanning
    this._isVideoFrozen = false;

    if (this._camera) {
      try {
        await this._camera.switchToDesiredState(FrameSourceState.On);
      } catch (error) {
        console.warn("Error resuming camera:", error);
      }
    }

    // Resume bounding box drawing
    if (this._barcodeBatch) {
      try {
        await this._barcodeBatch.setEnabled(true);
      } catch (error) {
        console.warn("Error re-enabling barcode batch:", error);
      }
    }

    // Resume camera monitoring
    this._startCameraMonitoring();

    // Resume drawing bounding boxes
    this._drawBoundingBoxes(this._currentBarcodes || []);

    // Reset freeze button
    if (this.refs.freezeButton) {
      this.refs.freezeButton.style.display = 'none';
      this.refs.freezeButton.innerHTML = '⏸'; // Reset to pause icon
      this.refs.freezeButton.style.background = 'rgba(255, 255, 255, 0.2)';
      this.refs.freezeButton.title = 'Freeze camera (or wait for auto-freeze)';
    }

    // Clear auto-freeze timeout if exists
    if (this._autoFreezeTimeout) {
      clearTimeout(this._autoFreezeTimeout);
      this._autoFreezeTimeout = null;
    }
  }

  _confirmMultiSelect() {
    if (this._pendingBarcodes.length === 0) {
      return;
    }

    // Get selected barcodes (only one should be selected with radio buttons)
    const selectedBarcodes = [];
    this._selectedBarcodeIndices.forEach(index => {
      if (this._pendingBarcodes[index]) {
        const barcodeData = this._pendingBarcodes[index].data;
        selectedBarcodes.push(barcodeData);
        this._captureBarcodeImage(this._pendingBarcodes, this._canvas);
      }
    });


    if (selectedBarcodes.length > 0) {
      const value = selectedBarcodes.join(", ");
      console.log("value in confirm multi select", value);
      this.setValue(value);
      if (this.refs.barcode) {
        this.refs.barcode.value = value;
      }

      this.validateAndSetDirty();
      this._updateBarcodePreview();

      // Send image to optional file upload field (only for first/selected barcode)
      this._sendBarcodeImageToFileUpload(selectedBarcodes[0]);
    }

    // Save ALL detected barcodes to backup field
    this._saveBackupBarcodes();

    this._hideConfirmationDialog();
    setTimeout(() => {
      this.stopScanner();
    }, 300);
  }

  async stopScanner() {
    try {
      // Hide confirmation dialog if shown
      if (this.refs.confirmationDialog && this.refs.confirmationDialog.style.display !== 'none') {
        this.refs.confirmationDialog.style.display = 'none';
        this.refs.confirmationDialog.style.opacity = '1';
      }

      // Hide freeze button when scanner stops
      if (this.refs.freezeButton) {
        this.refs.freezeButton.style.display = 'none';
      }

      // Release camera, dispose context and clear refs so next open gets fresh state
      await this._releaseScannerResources();
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
    // Performance optimization: Reduce monitoring frequency to save CPU
    if (this._cameraMonitoringInterval) {
      clearInterval(this._cameraMonitoringInterval);
    }
    
    this._cameraMonitoringInterval = setInterval(() => {
      this._checkAndResizeCamera();
    }, 500); // Reduced from 200ms to 500ms

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
            // Performance optimization: Stop animation loop if no barcodes
            this._animationFrameId = null;
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
    if (this._showingConfirmation) {
      return;
    }

    const rect = this._boundingBoxCanvas.getBoundingClientRect();
    const clickX = (event.clientX - rect.left);
    const clickY = (event.clientY - rect.top);

    for (const regionObj of this._clickableRegions) {
      const region = regionObj.region;
      if (this._isPointInBoundingBox(clickX, clickY, ...region)) {
        const barcode = regionObj.barcode;

        // Freeze camera when barcode is clicked
        if (!this._isVideoFrozen) {
          this._isVideoFrozen = true;
          if (this._camera) {
            this._camera.switchToDesiredState(FrameSourceState.Off);
          }
        }

        // Clear any pending timeout
        if (this._autoFreezeTimeout) {
          clearTimeout(this._autoFreezeTimeout);
          this._autoFreezeTimeout = null;
        }

        // If single barcode, directly confirm
        if (this._currentBarcodes.length === 1) {
          this.setValue(barcode.data);
          if (this.refs.barcode) {
            this.refs.barcode.value = barcode.data;
          }
          this.validateAndSetDirty();
          this.stopScanner();
        } else {
          // Multiple barcodes - show dialog with this one pre-selected
          this._showConfirmationDialog(this._currentBarcodes, barcode);
        }
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

  /**
   * Release camera, stop intervals, dispose Scandit context and null refs.
   * Call this when closing the scanner so the next open gets a fresh context
   * and the correct container (avoids blank/frozen when switching forms).
   */
  async _releaseScannerResources() {
    try {
      if (this._animationFrameId) {
        cancelAnimationFrame(this._animationFrameId);
        this._animationFrameId = null;
      }
      if (this._autoFreezeTimeout) {
        clearTimeout(this._autoFreezeTimeout);
        this._autoFreezeTimeout = null;
      }
      if (this._camera) {
        try {
          await this._camera.switchToDesiredState(FrameSourceState.Off);
        } catch (cameraError) {
          console.warn("Error stopping camera on release:", cameraError);
        }
        this._camera = null;
      }
      this._stopLiveScanningMode();
      if (this._cameraMonitoringInterval) {
        clearInterval(this._cameraMonitoringInterval);
        this._cameraMonitoringInterval = null;
      }
      if (this._containerResizeObserver) {
        this._containerResizeObserver.disconnect();
        this._containerResizeObserver = null;
      }
      this._clearBoundingBoxes();
      this._isVideoFrozen = false;
      this._showingConfirmation = false;
      this._confirmingBarcode = false;
      this._pendingBarcodes = [];

      if (this._barcodeBatch) {
        this._barcodeBatch = null;
      }
      if (this._barcodeCapture) {
        try {
          this._barcodeCapture.removeFromContext();
        } catch (e) {
          console.warn("Error removing barcode capture:", e);
        }
        this._barcodeCapture = null;
      }
      if (this._dataCaptureContext) {
        try {
          this._dataCaptureContext.dispose();
        } catch (e) {
          console.warn("Error disposing DataCaptureContext:", e);
        }
        this._dataCaptureContext = null;
      }
      this._dataCaptureView = null;
    } catch (error) {
      console.warn("Error in _releaseScannerResources (handled):", error);
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

      // Set display to none to completely remove modal from the document flow
      // This prevents any blocking or interference with form components
      this.refs.quaggaModal.style.display = "none";
      this.refs.quaggaModal.style.visibility = "hidden";
      this.refs.quaggaModal.style.pointerEvents = "none";
      this.refs.quaggaModal.style.opacity = "0";

      // Hide flashlight button
     /* if (this.refs.flashlightButton) {
        this.refs.flashlightButton.style.display = "none";
      }*/

      // Hide freeze button
      if (this.refs.freezeButton) {
        this.refs.freezeButton.style.display = "none";
      }
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
      // Reset display to flex to show the modal
      this.refs.quaggaModal.style.display = "flex";
      this.refs.quaggaModal.style.visibility = "visible";
      this.refs.quaggaModal.style.pointerEvents = "auto";
      this.refs.quaggaModal.style.opacity = "1";

      // Show flashlight button
     /* if (this.refs.flashlightButton) {
        this.refs.flashlightButton.style.display = "flex";
      }*/
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

    // Performance optimization: Increase interval to reduce CPU usage
    this._liveScanInterval = setInterval(() => {
      if (!this._isVideoFrozen && this._boundingBoxContext) {
        if (!this._lastBarcodeTime || Date.now() - this._lastBarcodeTime > 100) {
        }
      }
    }, 150); // Increased from 50ms to 150ms
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

    if (this._autoFreezeTimeout) {
      clearTimeout(this._autoFreezeTimeout);
      this._autoFreezeTimeout = null;
    }

    return super.detach();
  }

  _updateBarcodePreview() {
    if (!this.refs.barcodePreviewContainer || !this.refs.barcodePreviewList) {
      return;
    }

    // Only show preview if imageUploadField is configured
    if (!this.component.imageUploadField) {
      this.refs.barcodePreviewContainer.style.display = 'none';
      return;
    }

    // Get the current field value
    const fieldValue = this.dataValue || '';

    // Parse barcodes from comma-separated string
    let barcodes = [];
    if (fieldValue && typeof fieldValue === 'string' && fieldValue.trim().length > 0) {
      barcodes = fieldValue.split(',').map(b => b.trim()).filter(b => b.length > 0);
    }

    // Show/hide container based on whether barcodes exist
    if (barcodes.length === 0) {
      this.refs.barcodePreviewContainer.style.display = 'none';
      return;
    }

    this.refs.barcodePreviewContainer.style.display = 'block';
    this.refs.barcodePreviewList.innerHTML = '';

    // Create a card for each barcode
    barcodes.forEach((barcodeData, index) => {
      const card = document.createElement('div');
      card.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px;
        gap: 12px;
        transition: background 0.2s ease;
      `;
      card.onmouseover = () => card.style.background = '#f9f9f9';
      card.onmouseout = () => card.style.background = 'white';

      // Barcode image or placeholder
      const imageDiv = document.createElement('div');
      imageDiv.style.cssText = `
        flex-shrink: 0;
        background: #f0f0f0;
        border-radius: 4px;
        padding: 8px;
        min-width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `;

      // Check if we have a captured barcode image
      if (this._barcodeImages[barcodeData]) {
        const img = document.createElement('img');
        img.src = this._barcodeImages[barcodeData];
        img.style.cssText = `
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        `;
        imageDiv.appendChild(img);
      } else {
        // Show barcode icon as placeholder
        imageDiv.style.fontSize = '28px';
        imageDiv.textContent = '📊';
      }

      // Barcode data text
      const dataDiv = document.createElement('div');
      dataDiv.style.cssText = `
        flex: 1;
        color: #333;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        word-break: break-all;
      `;
      dataDiv.textContent = barcodeData;

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.style.cssText = `
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.2s ease;
        flex-shrink: 0;
      `;
      removeBtn.innerHTML = '✕ Remove';
      removeBtn.onmouseover = () => removeBtn.style.background = '#c82333';
      removeBtn.onmouseout = () => removeBtn.style.background = '#dc3545';
      removeBtn.addEventListener('click', () => {
        this._removeBarcodeAt(index);
      });

      card.appendChild(imageDiv);
      card.appendChild(dataDiv);
      card.appendChild(removeBtn);
      this.refs.barcodePreviewList.appendChild(card);
    });
  }
  getBoundingBox(location) {
    const xs = [location._topLeft._x, location._topRight._x, location._bottomLeft._x, location._bottomRight._x];
    const ys = [location._topLeft._y, location._topRight._y, location._bottomLeft._y, location._bottomRight._y];

    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;

    return { x, y, width, height };
  }
  _captureBarcodeImage(barcodes, canvas) {
    try {
      const MARGIN = 20;
      barcodes.forEach(barcode => {
        const { x, y, width, height } = this.getBoundingBox(barcode._location);
    
        // Expand bounding box with margin
        const bx = Math.max(0, x - MARGIN);
        const by = Math.max(0, y - MARGIN);
    
        const bWidth = Math.min(
            width + MARGIN * 2,
            canvas.width - bx
        );
    
        const bHeight = Math.min(
            height + MARGIN * 2,
            canvas.height - by
        );
    
        // Validate dimensions
        if (bWidth <= 0 || bHeight <= 0) return;
    
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = bWidth;
        croppedCanvas.height = bHeight;
        const croppedCtx = croppedCanvas.getContext('2d');
    
        // Draw expanded crop
        croppedCtx.drawImage(
            canvas,
            bx, by, bWidth, bHeight,   // source
            0, 0, bWidth, bHeight      // destination
        );
    
        const croppedDataURL = croppedCanvas.toDataURL('image/jpeg');
        this._barcodeImages[barcode.data] = croppedDataURL;
      })
    } catch (error) {
      console.warn('Error capturing barcode image:', error);
    }
  }

  _saveBackupBarcodes() {
    try {
      // If no backup field configured, skip
      if (!this.component.backupBarcodeField) {
        return;
      }

      // Get the root form data
      if (!this.root || !this.root.data) {
        return;
      }

      // Save all detected barcodes to the backup field as comma-separated string
      const backupValue = this._allDetectedBarcodes.join(", ");
      this.root.data[this.component.backupBarcodeField] = backupValue;

      // Optionally trigger form update if needed
      if (this.root.formio) {
        this.root.emit('change', this.root.data);
      }
    } catch (error) {
      console.warn('Error saving backup barcodes:', error);
    }
  }

  async _sendBarcodeImageToFileUpload(barcodeData) {
    try {
      // If no image upload field configured, skip
      if (!this.component.imageUploadField) {
        return;
      }

      // Get the image data for this barcode
      if (!this._barcodeImages[barcodeData]) {
        return;
      }

      const imageDataUrl = this._barcodeImages[barcodeData];

      // Get the root form and find the file upload component
      if (!this.root || !this.root.getComponent) {
        return;
      }

      const fileUploadComponent = this.root.getComponent(this.component.imageUploadField);
      if (!fileUploadComponent) {
        console.warn(`File upload component "${this.component.imageUploadField}" not found`);
        return;
      }
      async function uploadToFileComponent(fileComponent, file) {
        // file is a File object
        const uploadedData = await fileComponent.uploadFile(file);
        // uploadedData contains Form.io file metadata
        fileComponent.setValue(uploadedData);
        fileComponent.triggerChange();
        fileComponent.dirty = true;
        fileComponent.pristine = false;
        return uploadedData;
      }
      function base64ToFile(base64Data, fileName) {
        if (typeof base64Data !== 'string') {
          throw new Error('Expected base64Data to be a string');
        }
      
        const arr = base64Data.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        if (!mimeMatch) throw new Error('Invalid base64 format');
      
        const mime = mimeMatch[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
      
        return new File([u8arr], fileName, { type: mime });
      }
      
      

      const sanitizedBarcode = barcodeData.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
      const fileName = `barcode-${sanitizedBarcode}-${Date.now()}.png`;

      const file = await base64ToFile(imageDataUrl, fileName);
      var fileToSync = {
        dir: "",
        file: file,
        hash: "",
        name: fileName,
        options: null,
        originalName: fileName,
        size: file.size,
        storage: "s3"
            };
      const uploadedFiles = await fileUploadComponent.uploadFile(fileToSync);
      fileUploadComponent.setValue(uploadedFiles);
      fileUploadComponent.triggerChange();
      fileUploadComponent.dirty = true;
      fileUploadComponent.pristine = false;
    } catch (error) {
      console.warn('Error in _sendBarcodeImageToFileUpload:', error);
    }
        
  }

  _removeBarcodeAt(index) {
    const fieldValue = this.dataValue || '';

    if (!fieldValue || typeof fieldValue !== 'string') {
      return;
    }

    let barcodes = fieldValue.split(',').map(b => b.trim()).filter(b => b.length > 0);

    if (index >= 0 && index < barcodes.length) {
      const removedBarcode = barcodes[index];
      barcodes.splice(index, 1);

      // Clean up stored image for removed barcode
      if (this._barcodeImages[removedBarcode]) {
        delete this._barcodeImages[removedBarcode];
      }
    }

    const newValue = barcodes.join(', ');
    this.setValue(newValue);
    if (this.refs.barcode) {
      this.refs.barcode.value = newValue;
    }
    this.validateAndSetDirty();
    this._updateBarcodePreview();
  }

  _clearAllBarcodes() {
    this._barcodeImages = {}; // Clear all stored images
    this.setValue('');
    if (this.refs.barcode) {
      this.refs.barcode.value = '';
    }
    this.validateAndSetDirty();
    this._updateBarcodePreview();
  }

/*
  _toggleFlashlight() {
    if (!this._camera) {
      console.warn('Camera not available');
      return;
    }

    try {
      // Track torch state separately from camera on/off state
      const currentLightState = this._torchEnabled ? 'flashOn' : 'off';
      const newLightState = currentLightState === 'flashOn' ? 'off' : 'flashOn';
      const isMobile =
        typeof window !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!isMobile ) {
        this._showFlashlightNotSupported();
      }else {
        // Add the flashlight control
        try {
          // Scandit camera flash control
          if (newLightState === 'flashOn') {
            // Enable camera flash
            this._torchEnabled = true;
            this._updateFlashlightButtonState(true);

            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage('FLASH_ON');
            }


          } else {
            // Disable camera flash
            this._torchEnabled = false;
            this._updateFlashlightButtonState(false);
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage('FLASH_OFF');
            }
          }
        } catch (innerError) {
          this._showFlashlightNotSupported();
        }
      }
    } catch (error) {
      console.warn('Error in flashlight toggle:', error);
      this._showFlashlightNotSupported();
    }
  }
*/

  /*_updateFlashlightButtonState(isOn) {
    if (!this.refs.flashlightButton) {
      return;
    }

    if (isOn) {
      this.refs.flashlightButton.style.background = 'rgba(255, 255, 100, 0.4)';
      this.refs.flashlightButton.style.boxShadow = '0 4px 16px rgba(255, 255, 100, 0.6)';
      this.refs.flashlightButton.title = 'Camera flash is ON (click to turn off)';
    } else {
      this.refs.flashlightButton.style.background = 'rgba(255, 255, 255, 0.2)';
      this.refs.flashlightButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
      this.refs.flashlightButton.title = 'Toggle camera flash (for dark environments)';
    }
  }*/

/*  _showFlashlightNotSupported() {
    // Show a temporary notification that camera flash is not supported
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      z-index: 10000;
      animation: fadeInOut 3s ease-in-out;
    `;
    notification.textContent = 'Camera flash not supported on this device';

    // Add animation styles if not already present
    if (!document.getElementById('flashlight-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'flashlight-notification-styles';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }*/

  _manualFreeze() {
    // Toggle between frozen and running states
    if (this._isVideoFrozen) {
      // Resume scanning
      this._isVideoFrozen = false;
      if (this._camera) {
        this._camera.switchToDesiredState(FrameSourceState.On);
      }

      // Reset freeze button appearance
      if (this.refs.freezeButton) {
        this.refs.freezeButton.innerHTML = '⏸';
        this.refs.freezeButton.style.background = 'rgba(255, 255, 255, 0.2)';
        this.refs.freezeButton.title = 'Pause camera to check barcode';
      }

      // Clear auto-freeze timeout if running
      if (this._autoFreezeTimeout) {
        clearTimeout(this._autoFreezeTimeout);
        this._autoFreezeTimeout = null;
      }
    } else {
      // Pause the camera
      this._isVideoFrozen = true;
      if (this._camera) {
        this._camera.switchToDesiredState(FrameSourceState.Off);
      }

      // Update freeze button appearance to show resume state
      if (this.refs.freezeButton) {
        this.refs.freezeButton.innerHTML = '▶';
        this.refs.freezeButton.style.background = 'rgba(100, 200, 255, 0.4)';
        this.refs.freezeButton.title = 'Click to resume scanning';
      }

      // Clear the auto-freeze timeout since user manually froze
      if (this._autoFreezeTimeout) {
        clearTimeout(this._autoFreezeTimeout);
        this._autoFreezeTimeout = null;
      }

      // Get current detected barcodes and show confirmation dialog
      if (this._trackedBarcodes && Object.values(this._trackedBarcodes).length > 0) {
        const detectedBarcodes = Object.values(this._trackedBarcodes).map(tb => tb.barcode);
        this._showConfirmationDialog(detectedBarcodes);
      }
    }
  }

  destroy() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    if (this._barcodeBatch) {
      this._barcodeBatch = null;
    }

    if (this._barcodeCapture) {
      try {
        this._barcodeCapture.removeFromContext();
      } catch (e) {
        console.warn("Error removing barcode capture:", e);
      }
      this._barcodeCapture = null;
    }

    if (this._dataCaptureContext) {
      this._dataCaptureContext.dispose();
      this._dataCaptureContext = null;
    }

    if (this._cameraResizeObserver) {
      this._cameraResizeObserver.disconnect();
      this._cameraResizeObserver = null;
    }
    if (this._containerResizeObserver) {
      this._containerResizeObserver.disconnect();
      this._containerResizeObserver = null;
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

    if (this._autoFreezeTimeout) {
      clearTimeout(this._autoFreezeTimeout);
      this._autoFreezeTimeout = null;
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
    const changed = super.setValue(value, flags);
    if (this.refs && this.refs.barcode) {
      this.refs.barcode.value = value || "";
    }
    if (changed) {
      this.redraw();
    }
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

    if (isClearing && !allowClear) {
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


}

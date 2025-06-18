import { Components } from "@formio/js";
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
        multiple: true
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
    this.barcodeScanner = null;
    this.dynamsoft = null;
    this.modal = null;
    this.scannedBarcodes = [];
    
    // Load Dynamsoft SDK
    this._loadDynamsoftSDK();
  }

  _loadDynamsoftSDK() {
    if (window.Dynamsoft) {
      this.dynamsoft = window.Dynamsoft;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@10.5.3000/dist/dbr.bundle.js";
      script.async = true;
      script.onload = () => {
        this.dynamsoft = window.Dynamsoft;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load Dynamsoft SDK'));
      };
      document.head.appendChild(script);
    });
  }

  render() {
    // Determine if we should show multiple barcodes or a single barcode
    const isMultiple = this.component.multiple === true;
    let barcodeDisplay = '';
    
    if (isMultiple) {
      // For multiple barcodes, show a list
      const barcodes = Array.isArray(this.dataValue) ? this.dataValue : [];
      barcodeDisplay = `
        <div class="barcode-list" ref="barcodeList">
          ${barcodes.map((code, index) => `
            <div class="barcode-item" style="display:flex;align-items:center;margin-bottom:5px;">
              <input type="text" class="form-control" value="${code}" readonly style="flex:1;margin-right:5px;" />
              <button type="button" class="btn btn-danger btn-sm" ref="removeBarcode${index}">
                <i class="fa fa-times"></i>
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      // For single barcode, show a simple input
      barcodeDisplay = `
        <input
          ref="barcode"
          type="text"
          class="form-control"
          value="${this.dataValue || ""}"
          style="flex-grow:1; margin-right:10px;"
        />
      `;
    }

    return super.render(`
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          ${barcodeDisplay}
          <button ref="scanButton" type="button" class="btn btn-primary" style="margin-right:5px;">
            <i class="fa fa-camera"></i> Scan
          </button>
        </div>
        ${
          this.errorMessage
            ? `<div class="formio-errors">
                 <div class="form-text error">${this.errorMessage}</div>
               </div>`
            : ""
        }
      </div>
    `);
  }

  createModal() {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'barcode-scanner-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
    modal.style.zIndex = '1050';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'barcode-scanner-modal-content';
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.borderRadius = '5px';
    modalContent.style.width = '90%';
    modalContent.style.maxWidth = '800px';
    modalContent.style.maxHeight = '90%';
    modalContent.style.display = 'flex';
    modalContent.style.flexDirection = 'column';
    modalContent.style.overflow = 'hidden';

    // Create modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'barcode-scanner-modal-header';
    modalHeader.style.padding = '15px';
    modalHeader.style.borderBottom = '1px solid #e5e5e5';
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';

    const modalTitle = document.createElement('h5');
    modalTitle.textContent = 'Scan Barcodes';
    modalTitle.style.margin = '0';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'close';
    closeButton.innerHTML = '&times;';
    closeButton.style.border = 'none';
    closeButton.style.background = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = () => this.closeModal();

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);

    // Create modal body
    const modalBody = document.createElement('div');
    modalBody.className = 'barcode-scanner-modal-body';
    modalBody.style.padding = '15px';
    modalBody.style.flexGrow = '1';
    modalBody.style.position = 'relative';
    modalBody.style.minHeight = '400px';
    modalBody.style.overflow = 'hidden';

    // Create scanner container
    const scannerContainer = document.createElement('div');
    scannerContainer.className = 'scanner-container';
    scannerContainer.style.width = '100%';
    scannerContainer.style.height = '100%';
    scannerContainer.style.minHeight = '400px';
    modalBody.appendChild(scannerContainer);

    // Create results container
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'results-container';
    resultsContainer.style.marginTop = '10px';
    resultsContainer.style.maxHeight = '150px';
    resultsContainer.style.overflowY = 'auto';
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = `
      <h6>Scanned Barcodes:</h6>
      <ul class="scanned-list" style="padding-left: 20px;"></ul>
    `;
    modalBody.appendChild(resultsContainer);

    // Create modal footer
    const modalFooter = document.createElement('div');
    modalFooter.className = 'barcode-scanner-modal-footer';
    modalFooter.style.padding = '15px';
    modalFooter.style.borderTop = '1px solid #e5e5e5';
    modalFooter.style.display = 'flex';
    modalFooter.style.justifyContent = 'space-between';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.onclick = () => this.closeModal();

    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'btn btn-primary';
    doneButton.textContent = 'Done';
    doneButton.onclick = () => this.saveAndClose();

    modalFooter.appendChild(cancelButton);
    modalFooter.appendChild(doneButton);

    // Assemble modal
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modal.appendChild(modalContent);

    // Store references
    this.modal = modal;
    this.scannerContainer = scannerContainer;
    this.resultsContainer = resultsContainer;
    this.scannedList = resultsContainer.querySelector('.scanned-list');

    return modal;
  }

  closeModal() {
    if (this.barcodeScanner) {
      this.barcodeScanner.close();
      this.barcodeScanner = null;
    }
    
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
  }

  saveAndClose() {
    if (this.scannedBarcodes.length > 0) {
      if (this.component.multiple) {
        // For multiple barcodes, set the array value
        this.dataValue = this.scannedBarcodes;
      } else {
        // For single barcode, set the first value
        this.dataValue = this.scannedBarcodes[0];
      }
      this.triggerChange();
      this.redraw();
    }
    
    this.closeModal();
  }

  attach(element) {
    this.loadRefs(element, {
      scanButton: "single",
      barcode: "single",
      barcodeList: "single",
    });

    // Add event listener for scan button
    this.addEventListener(this.refs.scanButton, "click", () => this.startScanner());

    // Add event listeners for single barcode input if it exists
    if (this.refs.barcode) {
      this.addEventListener(this.refs.barcode, "change", () => {
        this.dataValue = this.refs.barcode.value;
        this.triggerChange();
      });
    }

    // Add event listeners for remove buttons if multiple barcodes
    if (this.component.multiple && Array.isArray(this.dataValue)) {
      this.dataValue.forEach((_, index) => {
        const removeButton = this.refs[`removeBarcode${index}`];
        if (removeButton) {
          this.addEventListener(removeButton, "click", () => {
            const newValue = [...this.dataValue];
            newValue.splice(index, 1);
            this.dataValue = newValue;
            this.triggerChange();
            this.redraw();
          });
        }
      });
    }

    return super.attach(element);
  }

  async startScanner() {
    try {
      if (!this.dynamsoft) await this._loadDynamsoftSDK();
      const modal = this.createModal();
      document.body.appendChild(modal);

      try {
        await this.dynamsoft.License.LicenseManager.initLicense("DLS2eyJoYW5kc2hha2VDb2RlIjoiMTA0MTYzMjcyLVRYbFhaV0pRY205cSIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21kbHMuZHluYW1zb2Z0b25saW5lLmNvbSIsIm9yZ2FuaXphdGlvbklEIjoiMTA0MTYzMjcyIiwic3RhbmRieVNlcnZlclVSTCI6Imh0dHBzOi8vc2Rscy5keW5hbXNvZnRvbmxpbmUuY29tIiwiY2hlY2tDb2RlIjotMTM1MzM3ODgwNH0=");
      } catch (e) {
        console.warn("License warning:", e);
      }

      this.scannedBarcodes = [];
      const D = this.dynamsoft;
      await D.Core.CoreModule.loadWasm(["dbr"]);

      const cvRouter = await D.CVR.CaptureVisionRouter.createInstance();
      const cameraView = await D.DCE.CameraView.createInstance();
      const cameraEnhancer = await D.DCE.CameraEnhancer.createInstance(cameraView);

      cvRouter.setInput(cameraEnhancer);
      cvRouter.addResultFilter(new D.Utility.MultiFrameResultCrossFilter());
      cvRouter.addResultReceiver(new (class extends D.CVR.CapturedResultReceiver {
      constructor(parent) { super(); this.parent = parent; }
        onDecodedBarcodesReceived = (result) => {
          cameraView.clearUserDefinedDrawingLayers();
          const drawingLayer = cameraView.getDrawingLayer(2) || cameraView.createDrawingLayer();
          drawingLayer.clearDrawingItems();          // clear only items on this layer :contentReference[oaicite:5]{index=5}

          drawingLayer.setVisible(true);
          const styleId = D.DCE.DrawingStyleManager.createDrawingStyle({
            strokeStyle: "#00FF00", lineWidth: 4, textColor: "#00FF00", font: "16px sans-serif"
          });
          const backgroundStyleId = D.DCE.DrawingStyleManager.createDrawingStyle({
            strokeStyle: "rgba(0, 255, 0, 0)",               // green border
            lineWidth: 2,
            fillStyle: "rgba(0, 0, 0, 0.5)",              // transparent black background
            paintMode: "strokeAndFill",                  // fill and stroke both applied
            textColor: "#00FF00",                        // green text
          });
          drawingLayer.setDefaultStyle(styleId, undefined, D.DCE.EnumDrawingItemMediaType.DIMT_BARCODE);
          result.barcodeResultItems?.forEach(item => {
            const { points } = item.location;
            const xs = points.map(p => p.x), ys = points.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            
            const width = Math.max(...xs) - x;
            const height = Math.max(...ys) - y;

            // Create the text label
            const textItem = new D.DCE.TextDrawingItem(
              item.text,
              { x: x, y: y - 50, width: width, height: 24, isMeasuredInPercentage: false },
              styleId
            );

            // Use getTextRect() to get the exact bounds
            const rect = textItem.getTextRect(); // { x, y, width, height }

            // Create a background rectangle based on that
            const textBackground = new D.DCE.RectDrawingItem(
              { x: rect.x, y: rect.y, width: rect.width, height: 50 },
              backgroundStyleId
            );

            // Bounding box around the barcode itself
            const boundingBox = new D.DCE.RectDrawingItem(
              { x, y, width, height },
              styleId
            );

            // Re-set items: remove text first, then draw background, text, and bounding box
            drawingLayer.addDrawingItems([textBackground, textItem, boundingBox]);
          });


          drawingLayer.renderAll();
        }
      })(this));


      const template = this.component.multiple ? "ReadBarcodes_Default" : "ReadSingleBarcode";
      const settings = await cvRouter.getSimplifiedSettings(template);
      settings.barcodeSettings.expectedBarcodesCount = this.component.multiple ? 0 : 1;
      await cvRouter.updateSettings(template, settings);
      await cvRouter.startCapturing(template);

      this.scannerContainer.innerHTML = "";
      this.scannerContainer.appendChild(cameraView.getUIElement());
      await cameraEnhancer.open();

      this.cvRouter = cvRouter;
      this.cameraEnhancer = cameraEnhancer;
      this.cameraView = cameraView;

    } catch (err) {
      console.error("Error starting scanner:", err);
      this.errorMessage = "Failed to start barcode scanner.";
      this.redraw();
      this.closeModal();
    }
  }


  updateValue() {
    if (this.refs.barcode) {
      this.dataValue = this.refs.barcode.value;
      this.triggerChange();
    }
  }

  destroy() {
    this.closeModal();
    if (this.cvRouter) {
      this.cvRouter.dispose();
      this.cvRouter = null;
    }
    if (this.cameraEnhancer) {
      this.cameraEnhancer.close();
      this.cameraEnhancer = null;
    }
    if (this.cameraView) {
      this.cameraView = null;
    }
    super.destroy();
  }
}

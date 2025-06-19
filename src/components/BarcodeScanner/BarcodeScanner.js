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
    this.debugUI = true;
    
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
    
    barcodeDisplay = `
        <input
          ref="barcode"
          type="text"
          class="form-control"
          value="${this.dataValue || ""}"
          style="flex-grow:1; margin-right:10px;"
        />
    `;

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
    closeButton.onclick = () => {
      console.log('Modal close button clicked');
      this.closeModal();
    };

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
    cancelButton.onclick = () => {
      console.log('Modal cancel button clicked');
      this.closeModal();
    };

    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.className = 'btn btn-primary';
    doneButton.textContent = 'Done';
    doneButton.onclick = () => {
      console.log('Modal done button clicked');
      this.saveAndClose();
    };

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
    console.log('saveAndClose called with scanned barcodes:', this.scannedBarcodes);
    if (this.scannedBarcodes.length > 0) {
      if (this.component.multiple) {
        // For multiple barcodes, set the array value
        console.log('Setting multiple barcodes:', this.scannedBarcodes);
        this.dataValue = this.scannedBarcodes;
      } else {
        // For single barcode, set the first value
        console.log('Setting single barcode:', this.scannedBarcodes[0]);
        this.dataValue = this.scannedBarcodes[0];
      }
      this.triggerChange();
      this.redraw();
    }
    
    
  }

  attach(element) {
    this.loadRefs(element, {
      scanButton: "single",
      barcode: "single",
      barcodeList: "single",
    });

    // Add event listener for scan button
    this.addEventListener(this.refs.scanButton, "click", () => {
      console.log('Scan button clicked');
      this.startScanner();
    });

    // Add event listeners for single barcode input if it exists
    if (this.refs.barcode) {
      this.addEventListener(this.refs.barcode, "change", () => {
        console.log('Barcode input changed:', this.refs.barcode.value);
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
            console.log('Remove button clicked for barcode at index:', index);
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
      this.detectedBarcodes = []; // Store detected barcodes with their locations
      const D = this.dynamsoft;
      await D.Core.CoreModule.loadWasm(["dbr"]);

      const cvRouter = await D.CVR.CaptureVisionRouter.createInstance();
      const cameraView = await D.DCE.CameraView.createInstance();
      const cameraEnhancer = await D.DCE.CameraEnhancer.createInstance(cameraView);

      // Add click event listener to the camera view
      const cameraElement = cameraView.getUIElement();
      cameraElement.addEventListener('click', (event) => {
        console.log('Camera view clicked at:', event.clientX, event.clientY);
        this.handleCameraViewClick(event.clientX, event.clientY);
      });

      cvRouter.setInput(cameraEnhancer);
      cvRouter.addResultFilter(new D.Utility.MultiFrameResultCrossFilter());
      cvRouter.addResultReceiver(new (class extends D.CVR.CapturedResultReceiver {
        constructor(parent) { super(); this.parent = parent; }
        onDecodedBarcodesReceived = (result) => {
          cameraView.clearUserDefinedDrawingLayers();
          const drawingLayer = cameraView.getDrawingLayer(2) || cameraView.createDrawingLayer();
          drawingLayer.clearDrawingItems();

          drawingLayer.setVisible(true);
          const styleId = D.DCE.DrawingStyleManager.createDrawingStyle({
            strokeStyle: "#00FF00", lineWidth: 4, textColor: "#00FF00", font: "16px sans-serif"
          });
          const backgroundStyleId = D.DCE.DrawingStyleManager.createDrawingStyle({
            strokeStyle: "rgba(0, 255, 0, 0)",
            lineWidth: 2,
            fillStyle: "rgba(0, 0, 0, 0.5)",
            paintMode: "strokeAndFill",
            textColor: "#00FF00",
          });
          drawingLayer.setDefaultStyle(styleId, undefined, D.DCE.EnumDrawingItemMediaType.DIMT_BARCODE);
          
          // Clear previous detected barcodes
          this.parent.detectedBarcodes = [];
          
          // Process each barcode result
          result.barcodeResultItems?.forEach(item => {
            const { points } = item.location;
            const xs = points.map(p => p.x), ys = points.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            
            const width = Math.max(...xs) - x;
            const height = Math.max(...ys) - y;

            // Store the barcode with its location for click detection
            this.parent.detectedBarcodes.push({
              text: item.text,
              x, y, width, height
            });

            // Create the text label
            const textItem = new D.DCE.TextDrawingItem(
              item.text,
              { x: x, y: y - 50, width: width, height: 24, isMeasuredInPercentage: false },
              styleId
            );

            // Use getTextRect() to get the exact bounds
            const rect = textItem.getTextRect();

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

            // Add items to drawing layer
            drawingLayer.addDrawingItems([textBackground, textItem, boundingBox]);
            
            // Add the barcode to scanned barcodes
            if (!this.parent.scannedBarcodes.includes(item.text)) {
              this.parent.scannedBarcodes.push(item.text);
            }
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

  handleCameraViewClick(clientX, clientY) {
    if (!this.detectedBarcodes?.length) return;

    // Get camera element and its dimensions
    const cameraElement = this.cameraView.getUIElement();
    const cameraRect = cameraElement.getBoundingClientRect();
    
    // Calculate relative position within the camera view (0-1 range)
    const relativeX = (clientX - cameraRect.left) / cameraRect.width;
    const relativeY = (clientY - cameraRect.top) / cameraRect.height;
    
    // Convert to camera coordinates based on the actual video dimensions
    // Note: We need to account for possible scaling/letterboxing in the view
    const videoWidth = this.cameraEnhancer.getResolution().width;
    const videoHeight = this.cameraEnhancer.getResolution().height;
    
    // Calculate camera coordinates
    const cameraX = relativeX * videoWidth;
    const cameraY = relativeY * videoHeight;
    
    // Get drawing layer for debug visualization
    const debugLayer = this.cameraView.getDrawingLayer(3) || this.cameraView.createDrawingLayer(3);
    debugLayer.clearDrawingItems();
    debugLayer.setVisible(true);
    
    
    // Create styles for debug visualization
    const clickStyleId = this.dynamsoft.DCE.DrawingStyleManager.createDrawingStyle({
      strokeStyle: "#FF0000", 
      lineWidth: 4,
      fillStyle: "rgba(255, 0, 0, 0.3)",
      paintMode: "strokeAndFill"
    });
    
    const bboxStyleId = this.dynamsoft.DCE.DrawingStyleManager.createDrawingStyle({
      strokeStyle: "#0000FF", 
      lineWidth: 2,
      fillStyle: "rgba(0, 0, 255, 0.2)",
      paintMode: "strokeAndFill"
    });
    
    const hitStyleId = this.dynamsoft.DCE.DrawingStyleManager.createDrawingStyle({
      strokeStyle: "#FF00FF", 
      lineWidth: 3,
      fillStyle: "rgba(255, 0, 255, 0.3)",
      paintMode: "strokeAndFill"
    });
    if(this.debugUI){
      // Draw a marker at the click point
      const clickMarker = new this.dynamsoft.DCE.RectDrawingItem(
        { x: cameraX - 10, y: cameraY - 10, width: 20, height: 20 },
        clickStyleId
      );
      debugLayer.addDrawingItems([clickMarker]);
    }
    
    
    // Draw all bounding boxes for debugging
    for (const barcode of this.detectedBarcodes) {
      // Check if click is inside this barcode
      const isHit = 
        cameraX >= barcode.x &&
        cameraX <= barcode.x + barcode.width &&
        cameraY >= barcode.y &&
        cameraY <= barcode.y + barcode.height;
      
      if(this.debugUI){
        // Use different style based on whether it was hit
        const styleToUse = isHit ? hitStyleId : bboxStyleId;
        
        // Draw the bounding box
        const bboxRect = new this.dynamsoft.DCE.RectDrawingItem(
          { x: barcode.x, y: barcode.y, width: barcode.width, height: barcode.height },
          styleToUse
        );
        
        // Add text label showing coordinates and barcode text
        const coordsText = new this.dynamsoft.DCE.TextDrawingItem(
          `${barcode.text} (x:${Math.round(barcode.x)},y:${Math.round(barcode.y)})`,
          { x: barcode.x, y: barcode.y - 20, width: barcode.width, height: 20 },
          styleToUse
        );
        
        debugLayer.addDrawingItems([bboxRect, coordsText]);
      }
      
      
      if (isHit) {
        console.log('Click detected inside barcode:', barcode.text);
        
        // Get the active input element (if any)
        if (this.refs.barcode) {
          console.log('Setting component input value to:', barcode.text);
          this.refs.barcode.value = barcode.text;
          this.refs.barcode.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Close the modal
          this.closeModal();
          return;
        } else {
          console.log('Component input element not found');
          
          // If no input reference, just add to scanned barcodes
          if (!this.scannedBarcodes.includes(barcode.text)) {
            this.scannedBarcodes.push(barcode.text);
          }
        }
      }
    }
    
    // Render all debug visualizations
    debugLayer.renderAll();
    
    // Keep debug visualization visible for a few seconds
    setTimeout(() => {
      debugLayer.clearDrawingItems();
      debugLayer.renderAll();
    }, 5000);
  }
}

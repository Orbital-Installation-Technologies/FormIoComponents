import { Components } from "@formio/js";
import BarcodeScannerEditForm from "./BarcodeScanner.form";

const FieldComponent = Components.components.field;

export default class BarcodeScanner extends FieldComponent {
  static editForm = BarcodeScannerEditForm;

  constructor(component, options, data) {
    super(component, options, data);
    this.barcodeScanner = null;
    this.cvRouter = null;
    this.cameraEnhancer = null;
    this.cameraView = null;
    this.errorMessage = "";
    this._loadDynamsoftSDK();
  }

  static schema(...extend) {
    return FieldComponent.schema(
      { type: "barcode", label: "Barcode", key: "" },
      ...extend
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

  _loadDynamsoftSDK() {
    if (window.Dynamsoft) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@10.5.3000/dist/dbr.bundle.js";
      s.async = true;
      s.onload = () => window.Dynamsoft ? resolve() : reject(new Error("Dynamsoft.DB unavailable"));
      s.onerror = () => reject(new Error("Failed to load Dynamsoft SDK"));
      document.head.appendChild(s);
    });
  }

  render() {
    return super.render(`
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center;">
          <input ref="barcode" type="text" class="form-control"
            value="${this.dataValue||''}" style="flex:1;margin-right:5px;"/>
          <button ref="scanButton" class="btn btn-primary"><i class="fa fa-camera"/></button>
        </div>
        ${this.errorMessage ? `<div class="form-text error">${this.errorMessage}</div>` : ""}
        <div ref="scannerContainer" style="display:none;width:100%;height:400px;"></div>
      </div>`);
  }

  attach(element) {
    this.loadRefs(element, { barcode: "single", scanButton: "single", scannerContainer: "single" });
    this.addEventListener(this.refs.scanButton, "click", () => this.startScanner());
    this.addEventListener(this.refs.barcode, "change", () => this.updateValue());
    return super.attach(element);
  }

  async startScanner() {
    try {
      await this._loadDynamsoftSDK();
      const D = window.Dynamsoft;
      D.License.LicenseManager.initLicense("DLS2eyJoYW5kc2hha2VDb2RlIjoiMTA0MTYzMjcyLVRYbFhaV0pRY205cSIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21kbHMuZHluYW1zb2Z0b25saW5lLmNvbSIsIm9yZ2FuaXphdGlvbklEIjoiMTA0MTYzMjcyIiwic3RhbmRieVNlcnZlclVSTCI6Imh0dHBzOi8vc2Rscy5keW5hbXNvZnRvbmxpbmUuY29tIiwiY2hlY2tDb2RlIjotMTM1MzM3ODgwNH0=");  // v10+ license API :contentReference[oaicite:1]{index=1}

      await D.Core.CoreModule.loadWasm(["dbr"]);  // optional preload :contentReference[oaicite:2]{index=2}

      if (!this.cvRouter) {
        this.cvRouter = await D.CVR.CaptureVisionRouter.createInstance();  // v10+ new router API :contentReference[oaicite:3]{index=3}
        this.cameraView = await D.DCE.CameraView.createInstance();
        this.cameraEnhancer = await D.DCE.CameraEnhancer.createInstance(this.cameraView);
        this.cvRouter.setInput(this.cameraEnhancer);
        this.cvRouter.addResultFilter(new D.Utility.MultiFrameResultCrossFilter());
        this.cvRouter.startCapturing("ReadSingleBarcode");
        this.cvRouter.addResultReceiver(new class extends D.CVR.CapturedResultReceiver {
          onDecodedBarcodesReceived = (res) => {
            if (res.barcodeResults?.length) {
              const txt = res.barcodeResults[0].barcodeText;
              this.refs.barcode.value = txt;
              this.updateValue();
              this.stopScanner();
            }
          };
        });
      }

      this.refs.scannerContainer.innerHTML = "";
      this.refs.scannerContainer.append(this.cameraView.getUIElement());
      this.refs.scannerContainer.style.display = "block";
      await this.cameraEnhancer.open();

    } catch (err) {
      console.error(err);
      this.errorMessage = "Failed to start scanner.";
      this.redraw();
    }
  }

  stopScanner() {
    this.cvRouter?.stopCapturing();
    this.cameraEnhancer?.close();
    this.refs.scannerContainer.style.display = "none";
  }

  updateValue() {
    this.dataValue = this.refs.barcode.value;
    this.triggerChange();
  }

  destroy() {
    this.stopScanner();
    this.cvRouter = this.cameraEnhancer = this.cameraView = null;
    super.destroy();
  }
}

import { Formio } from "formiojs";
import BarcodeScannerEditForm from "./BarcodeScanner.form";

const Field = Formio.Components.components.field;

export default class BarcodeScanner extends Field {
  static editForm = BarcodeScannerEditForm;
  static schema(...extend) {
    return Field.schema({
      type: "barcode",
      label: "Barcode",
      key: "",
    });
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
  }

  init() {
    super.init();
  }

  get inputInfo() {
    const info = super.inputInfo;
    return info;
  }

  render(content) {
    let component = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">`;
    component += `
      <input 
        ref="barcode" 
        type="text" 
        class="form-control" 
        value="" 
        style="flex-grow: 1; margin-right: 10px;"
      >
      <button 
        ref="scanButton" 
        type="button" 
        class="btn btn-primary">
        <i class="fa fa-camera"></i>
      </button>
      <input 
        ref="fileInput"
        type="file"
        accept="image/*" 
        capture="environment" 
        style="display: none;" 
        multiple="false"
      >
    `;
    component += "</div>";
    if (this.errorMessage) {
      component += `
      <div class="formio-errors">
        <div class="form-text error">${this.errorMessage}</div>
      </div>`;
    }
    component += `</div>`;

    return super.render(component);
  }

  attach(element) {
    this.loadRefs(element, {
      barcode: "single",
      scanButton: "single",
      fileInput: "single",
    });

    if (!this.component.disabled) {
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.test.value);
      });

      this.refs.scanButton.addEventListener("click", () => {
        setTimeout(() => {
          this.refs.fileInput.dispatchEvent(new MouseEvent("click"));
        }, 0);
      });

      this.refs.fileInput.addEventListener("change", (event) => {
        if (event.target.files.length > 0) {
          const file = event.target.files[0];
          this.decodeBarcode(file);
        }
      });
    }
    return super.attach(element);
  }

  async decodeBarcode(file) {
    if (!("BarcodeDetector" in window)) {
      console.log("Barcode Detector is not supported in this browser.");
      return;
    }

    const supportedFormats = await BarcodeDetector.getSupportedFormats().then(
      (supportedFormats) => {
        return supportedFormats;
      },
    );

    const barcodeDetector = new BarcodeDetector({ formats: supportedFormats });
    const reader = new FileReader();

    reader.onload = async (event) => {
      const image = new Image();
      image.src = event.target.result;
      image.onload = async () => {
        try {
          const barcodes = await barcodeDetector.detect(image);
          if (barcodes.length > 0) {
            this.setError(null);
            this.updateState();
            this.updateValue(barcodes[0].rawValue.toString());
            this.refs.test.value = barcodes[0].rawValue.toString();
          } else {
            this.refs.test.value = "";
            this.setError("No barcode detected. Please try again.");
            this.updateState();
          }
        } catch (error) {
          console.error("Barcode detection failed:", error);
          this.setError("Error in barcode detection. Please try again.");
          this.updateState();
        }
      };
    };

    reader.readAsDataURL(file);
  }

  updateState() {
    this.triggerChange();
    this.redraw();
  }

  setError(message) {
    if (message) {
      this.errorMessage = message;
      setTimeout(() => {
        this.errorMessage = "";
        this.updateState();
      }, 3000);
    } else {
      this.errorMessage = "";
    }
  }

  detach() {
    return super.detach();
  }

  destroy() {
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
    return super.setValue(value, flags);
  }

  setValueAt(index, value, flags = {}) {
    return super.setValueAt(index, value, flags);
  }

  updateValue(value, flags = {}) {
    return super.updateValue(...arguments);
  }
}

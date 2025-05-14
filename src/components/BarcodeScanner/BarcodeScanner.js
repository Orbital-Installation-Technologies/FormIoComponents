import { Components } from "@formio/js";
import BarcodeScannerEditForm from "./BarcodeScanner.form";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";

const FieldComponent = Components.components.field;

export default class BarcodeScanner extends FieldComponent {
  static editForm = BarcodeScannerEditForm;
  static schema(...extend) {
    return FieldComponent.schema({
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
        value="${this.dataValue || ""}"
        style="flex-grow: 1; margin-right: 10px;"
      >
      <button 
        ref="scanButton" 
        type="button" 
        class="btn btn-primary">
        <i class="fa fa-camera bi bi-camera"></i>
      </button>
      <input 
        ref="fileInput"
        type="file"
        accept="image/*" 
        style="display: none;" 
        multiple="false"
      />
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
    const attached = super.attach(element);

    this.loadRefs(element, {
      barcode: "single",
      scanButton: "single",
      fileInput: "single",
    });

    if (!this.refs.barcode || !this.refs.scanButton || !this.refs.fileInput) {
        console.warn("BarcodeScanner refs not ready. Skipping event bindings.");
        return;
      }

      if (this.dataValue) {
        this.refs.barcode.value = this.dataValue;
      }

      if (!this.component.disabled) {
        this.refs.barcode.addEventListener("change", () => {
          this.updateValue(this.refs.barcode.value);
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

    return attached;
  }


  async decodeBarcode(file) {
    const reader = new FileReader();

    reader.onload = async (event) => {
      const image = new Image();
      image.src = event.target.result;
      image.crossOrigin = "Anonymous";
      image.onload = async () => {
        const formats = [
          BarcodeFormat.AZTEC,
          BarcodeFormat.CODABAR,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.MAXICODE,
          BarcodeFormat.PDF_417,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.RSS_14,
          BarcodeFormat.RSS_EXPANDED,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.UPC_EAN_EXTENSION,
        ];
        const hints = new Map();
        hints.set(2, formats);
        hints.set(3, true);
        const codeReader = new BrowserMultiFormatReader(hints);
        try {
          const result = await codeReader.decodeFromImageElement(image);
          this.updateValue(result.getText());
          this.refs.barcode.value = result.getText();
          this.setError(null);
        } catch (error) {
          console.error("Barcode detection failed:", error);
          this.setError("No barcode detected. Please try again.");
          this.updateState();
        }
      };
    };

    reader.readAsDataURL(file);
  }

  triggerChange() {}

  updateState() {
    this.triggerChange();
    this.redraw();
  }

  setError(message) {
    this.errorMessage = message || "";
    this.updateState();
  }

  detach() {
    if (this.refs.barcode) {
      this.refs.barcode.removeEventListener("change", () => this.updateValue(this.refs.barcode.value));
    }
    if (this.refs.scanButton) {
      this.refs.scanButton.removeEventListener("click", this.scanButtonClickHandler);
    }
    if (this.refs.fileInput) {
      this.refs.fileInput.removeEventListener("change", this.fileInputChangeHandler);
    }
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
    super.setValue(value, flags);
    if (this.refs.barcode) {
      this.refs.barcode.value = value || "";
    }
  }

  setValueAt(index, value, flags = {}) {
    return super.setValueAt(index, value, flags);
  }

  updateValue(value, flags = {}) {
    return super.updateValue(...arguments);
  }
}

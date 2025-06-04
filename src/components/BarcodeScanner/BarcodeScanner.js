import { Components } from "@formio/js";
import Quagga from "quagga";
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
    window.Quagga = Quagga;
  }

  init() {
    super.init();
  }

  conditionallyHidden(data) {
    if (!this.component.customConditional) return false;

    try {
      return !this.evaluate(
        this.component.customConditional,
        { ...this.data, ...data },
        this.data
      );
    } catch (e) {
      console.warn("Conditional logic error:", e);
      return false;
    }
  }

  get inputInfo() {
    return super.inputInfo;
  }

  render(content) {
    const component = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
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
        </div>
        ${
          this.errorMessage
            ? `<div class="formio-errors">
                 <div class="form-text error">${this.errorMessage}</div>
               </div>`
            : ""
        }
        <!-- Modal container for live video + canvas -->
        <div
          ref="quaggaModal"
          style="
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 9999;
            align-items: center;
            justify-content: center;
          ">
          <div
            style="position: relative; width: 640px; height: 480px;; display: flex; flex-direction: column; background-color: gray"
          >
            <div style="display: flex; justify-content: flex-end; padding: 10px;">
              <button ref="closeModal" class="btn btn-light">Close</button>
            </div>
            <div style="flex:1; position: relative;">
              <!-- Container for Quagga’s own <video> & <canvas> -->
              <div ref="quaggaContainer" style="width:640px; height:480px;"></div>
              <!-- We’ll draw our own overlay on top, if needed: -->
              <canvas
                ref="quaggaOverlay"
                style="position:absolute; top:0; left:0; width:100%; height:100%;"
              ></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    return super.render(component);
  }

  attach(element) {
    const attached = super.attach(element);

    this.loadRefs(element, {
      barcode: "single",
      scanButton: "single",
      quaggaModal: "single",
      quaggaContainer: "single", // new container ref
      quaggaOverlay: "single",
      closeModal: "single",
    });


    if (
      !this.refs.barcode ||
      !this.refs.scanButton ||
      !this.refs.quaggaModal ||
      !this.refs.quaggaContainer ||
      !this.refs.quaggaOverlay ||
      !this.refs.closeModal
    ) {
      console.warn("BarcodeScanner refs not ready. Skipping event bindings.");
      return attached;
    }

    // Populate input if there's an existing value
    if (this.dataValue) {
      this.refs.barcode.value = this.dataValue;
    }

    if (!this.component.disabled) {
      // Update Form.io data when user types manually
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
      });

      // Open the Quagga modal on button click
      this.refs.scanButton.addEventListener("click", () => {
        this.openQuaggaModal();
      });

      // Close button shuts down Quagga and hides modal
      this.refs.closeModal.addEventListener("click", () => {
        this.stopQuagga();
        this.refs.quaggaModal.style.display = "none";
      });
    }

    return attached;
  }

  openQuaggaModal() {
    // Show the modal
    this.refs.quaggaModal.style.display = "flex";

    // Grab the “container” element (not a video tag)
    const container = this.refs.quaggaContainer;
    const overlayCtx = this.refs.quaggaOverlay.getContext("2d");

    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: container,          // <–– this is crucial
        constraints: {
          facingMode: "environment"
        },
      },
      decoder: {
        readers: [
          "code_128_reader",
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader"
        ]
      },
      locate: true
    };

    window.Quagga.init(config, (err) => {
      if (err) {
        console.error("Quagga init error:", err);
        // Show an error/fallback UI if needed
        return;
      }
      window.Quagga.start();
    });

    window.Quagga.onProcessed((result) => {
      // Clear the overlay
      overlayCtx.clearRect(0, 0, container.clientWidth, container.clientHeight);

      if (result && result.boxes) {
        result.boxes
          .filter(box => box !== result.box)
          .forEach((box) => {
            this.drawPath(overlayCtx, box, "rgba(255, 255, 255, 0.5)");
          });
      }
      if (result && result.box) {
        this.drawPath(overlayCtx, result.box, "rgba(0, 255, 0, 0.7)");
      }
    });

    window.Quagga.onDetected((data) => {
      const code = data.codeResult.code;
      this.updateValue(code);
      this.refs.barcode.value = code;

      // Flash border briefly
      this.refs.quaggaModal.style.border = "5px solid lime";
      setTimeout(() => {
        this.refs.quaggaModal.style.border = "none";
        // Optionally auto-close:
        // this.stopQuagga();
        // this.refs.quaggaModal.style.display = "none";
      }, 300);
    });
  }

  stopQuagga() {
    try {
      window.Quagga.stop();
      window.Quagga.offProcessed();
      window.Quagga.offDetected();
    } catch (e) {
      // Quagga may not be running—ignore
    }
  }

  drawPath(ctx, points, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.lineTo(points[0][0], points[0][1]);
    ctx.stroke();
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
      this.refs.barcode.removeEventListener("change", () =>
        this.updateValue(this.refs.barcode.value),
      );
    }
    if (this.refs.scanButton) {
      this.refs.scanButton.removeEventListener("click", this.openQuaggaModal);
    }
    if (this.refs.closeModal) {
      this.refs.closeModal.removeEventListener("click", this.stopQuagga);
    }
    return super.detach();
  }

  destroy() {
    this.stopQuagga();
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

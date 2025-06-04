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
    this._lastBox = null;     // stores the points of the green bounding polygon
    this._lastCode = null;    // stores the last detected barcode string
    this._onOverlayClick = this._onOverlayClick.bind(this);
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
    // We create a 400×300px container for Quagga’s video + overlay,
    // and absolutely place the "Close" button on top.
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
            <i class="fa fa-camera"></i>
          </button>
        </div>
        ${
          this.errorMessage
            ? `<div class="formio-errors">
                 <div class="form-text error">${this.errorMessage}</div>
               </div>`
            : ""
        }
        <!-- Modal overlay: full-screen dark background -->
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
          <!-- Centered 400×300 box -->
          <div
            style="
              position: relative;
              width: 400px;
              height: 300px;
              background-color: #333;
              border-radius: 8px;
              box-shadow: 0 0 10px rgba(0,0,0,0.5);
              overflow: hidden;
            ">
            <!-- Close button sits on top-right -->
            <button
              ref="closeModal"
              style="
                position: absolute;
                top: 8px;
                right: 8px;
                z-index: 20;
              "
              class="btn btn-light">
              Close
            </button>
            <!-- Quagga’s <video> and overlay <canvas> -->
            <div
              ref="quaggaContainer"
              style="
                width: 100%;
                height: 100%;
                position: relative;
                background: black;
              "
            >
              <!-- Quagga will inject a <video> element here -->
              <canvas
                ref="quaggaOverlay"
                style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  pointer-events: auto; /* allow clicks for box detection */
                  z-index: 10;
                "
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
      quaggaContainer: "single",
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

    // If there is already a value, populate the input
    if (this.dataValue) {
      this.refs.barcode.value = this.dataValue;
    }

    if (!this.component.disabled) {
      // Manual typing → Form.io
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
      });

      // On “Scan” click, open the modal & start Quagga
      this.refs.scanButton.addEventListener("click", () => {
        this.openQuaggaModal();
      });

      // On “Close” click, stop Quagga & hide modal
      this.refs.closeModal.addEventListener("click", () => {
        this.stopQuagga();
        this.refs.quaggaModal.style.display = "none";
        this._clearOverlay();
        this._lastBox = null;
        this._lastCode = null;
        this.refs.quaggaOverlay.removeEventListener("click", this._onOverlayClick);
      });
    }

    return attached;
  }

  openQuaggaModal() {
    // 1) Show the full-screen modal
    this.refs.quaggaModal.style.display = "flex";

    // 2) Reset any previous state
    this._lastBox = null;
    this._lastCode = null;
    this._clearOverlay();

    // 3) Enable click‐through on the overlay (to detect green‐box taps)
    const overlay = this.refs.quaggaOverlay;
    overlay.style.pointerEvents = "auto";
    overlay.addEventListener("click", this._onOverlayClick);

    // 4) Define a function to run *after* Quagga has injected its <video>
    const onVideoReady = () => {
      const container = this.refs.quaggaContainer;
      const overlay = this.refs.quaggaOverlay;
      // Find the <video> element that Quagga just created
      const video = container.querySelector("video");
      if (!video) {
        // Not ready yet, try again in 50ms
        return setTimeout(onVideoReady, 50);
      }

      // Wait until the video’s metadata is loaded (native resolution known)
      if (!video.videoWidth || !video.videoHeight) {
        return setTimeout(onVideoReady, 50);
      }

      // 5) Make the <video> fill exactly 400×300 without cropping:
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "cover"; 
      // Because container is 4:3 and video is 4:3 (640×480), object-fit:cover will NOT crop.
      // If your camera orientation differs, this still fills the container.

      // 6) Now size the overlay <canvas> to match the video’s intrinsic resolution:
      const vidW = video.videoWidth;   // e.g. 640
      const vidH = video.videoHeight;  // e.g. 480
      overlay.width = vidW;
      overlay.height = vidH;

      // 7) Scale the canvas’s *display* size to fill the container CSS (400×300):
      overlay.style.width = container.clientWidth + "px";   // "400px"
      overlay.style.height = container.clientHeight + "px"; // "300px"

      // 8) Compute scale factors to map video‐pixel coords → CSS coords:
      const scaleX = container.clientWidth / vidW;
      const scaleY = container.clientHeight / vidH;

      const ctx = overlay.getContext("2d");
      // Reset any previous transforms, then scale
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

      // 9) Start drawing Quagga’s results onto this overlay
      this._startQuaggaProcessing(ctx);
    };

    // 10) Initialize Quagga with single­-barcode detection
    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: this.refs.quaggaContainer,
        constraints: {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        },
        // Focus scanning on the central 60% × 60% area (helps accuracy)
        area: {
          top: "20%",
          right: "20%",
          left: "20%",
          bottom: "20%",
        },
      },
      locator: {
        patchSize: "medium", 
        halfSample: true,
      },
      decoder: {
        readers: [
          "code_128_reader",
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
        ],
        multiple: false, // ← only look for one barcode
      },
      locate: true,
      numOfWorkers: navigator.hardwareConcurrency || 2,
    };

    window.Quagga.init(config, (err) => {
      if (err) {
        console.error("Quagga init error:", err);
        const container = this.refs.quaggaContainer;
        container.innerHTML = `
          <div style="
            color: white;
            text-align: center;
            padding: 20px;
            font-size: 1rem;
          ">
            🚫 Camera failed to start:<br>
            ${err.name || err.message}
          </div>`;
        return;
      }
      window.Quagga.start();
      // Once Quagga has inserted <video>, run onVideoReady
      onVideoReady();
    });
  }

  _startQuaggaProcessing(overlayCtx) {
    const overlay = this.refs.quaggaOverlay;

    // onProcessed: draw all candidate boxes, then highlight the "best" box in green
    window.Quagga.onProcessed((result) => {
      // Clear the entire canvas (in *video pixel* units)
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      if (result && result.boxes) {
        // Draw faint white boxes for every candidate
        result.boxes
          .filter((b) => b !== result.box)
          .forEach((b) => {
            this._drawPath(overlayCtx, b, "rgba(255, 255, 255, 1)");
          });
      }

      if (result && result.box) {
        // Save the “best” box polygon
        this._lastBox = result.box;
        // Draw the green bounding polygon
        this._drawPath(overlayCtx, result.box, "rgba(0, 255, 0, 1)");
      }
    });

    // onDetected: store the code but DO NOT auto-insert.
    // Instead highlight the modal’s border, waiting for user click.
    window.Quagga.onDetected((data) => {
      this._lastCode = data.codeResult.code;
      // Flash the modal border so user knows “a code is locked”
      this.refs.quaggaModal.style.border = "4px solid lime";
      setTimeout(() => {
        this.refs.quaggaModal.style.border = "";
      }, 400);
    });
  }

  _drawPath(ctx, points, color) {
    if (!points || !points.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
  }

  _onOverlayClick(evt) {
    // If no “best box” or no detected code, do nothing
    if (!this._lastBox || !this._lastCode) return;

    const overlay = this.refs.quaggaOverlay;
    const container = this.refs.quaggaContainer;

    // Get the overlay’s DOM bounding box (CSS coords)
    const rect = overlay.getBoundingClientRect();

    // We know overlay.width = video.videoWidth, overlay.height = video.videoHeight
    // And overlay CSS width/height = container.clientWidth/Height.
    const vidW = overlay.width;
    const vidH = overlay.height;
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;

    // Compute scale factors to map CSS → video pixels:
    const scaleX = vidW / cssW;
    const scaleY = vidH / cssH;

    // Convert the click’s clientX/clientY into video‐pixel coords:
    const clickX = (evt.clientX - rect.left) * scaleX;
    const clickY = (evt.clientY - rect.top) * scaleY;

    // Check if the click is inside the last bounding polygon:
    if (this._pointInPolygon(clickX, clickY, this._lastBox)) {
      // User clicked inside the green box: insert & close
      this.updateValue(this._lastCode);
      this.refs.barcode.value = this._lastCode;
      this.stopQuagga();
      this.refs.quaggaModal.style.display = "none";
      this._clearOverlay();
      this._lastBox = null;
      this._lastCode = null;
      overlay.removeEventListener("click", this._onOverlayClick);
    }
  }

  _pointInPolygon(x, y, polygon) {
    // Ray-casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];
      const intersect =
        (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  _clearOverlay() {
    const overlay = this.refs.quaggaOverlay;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      // Reset transform to identity before clearing
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }

  stopQuagga() {
    try {
      window.Quagga.offProcessed();
      window.Quagga.offDetected();
      window.Quagga.stop();
    } catch (e) {
      // If Quagga isn’t running, ignore
    }
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
    if (this.refs.quaggaOverlay) {
      this.refs.quaggaOverlay.removeEventListener("click", this._onOverlayClick);
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

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
    this._lastBox = null;      // raw Quagga box: array of [x,y] in video‐pixel space
    this._lastCode = null;     // decoded string
    this._videoDims = null;    // { width, height } from the <video>
    this._smoothedBoxes = null;
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

  render(content) {
    // 400×300 modal with video + overlay canvas inside
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
          <button ref="scanButton" type="button" class="btn btn-primary">
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
        <!-- Full‐screen dark backdrop -->
        <div
          ref="quaggaModal"
          style="
            display:none;
            position:fixed;
            top:0; left:0;
            width:100%; height:100%;
            background:rgba(0,0,0,0.8);
            z-index:9999;
            align-items:center;
            justify-content:center;
          ">
          <!-- Centered 400×300 box -->
          <div
            style="
              position:relative;
              width:400px;
              height:300px;
              background-color:#333;
              border-radius:8px;
              box-shadow:0 0 10px rgba(0,0,0,0.5);
              overflow:hidden;
            ">
            <!-- Close button in top‐right -->
            <button
              ref="closeModal"
              style="
                position:absolute;
                top:8px; right:8px;
                z-index:20;
              "
              class="btn btn-light">
              Close
            </button>
            <!-- Container for Quagga’s <video> + our overlay <canvas> -->
            <div
              ref="quaggaContainer"
              style="
                width:100%;
                height:100%;
                position:relative;
                background:black;
              ">
              <!-- Quagga-injected <video> goes here -->
              <canvas
                ref="quaggaOverlay"
                width="400"
                height="300"
                style="
                  position:absolute;
                  top:0; left:0;
                  cursor:pointer;
                  z-index:10;
                ">
              </canvas>
            </div>
          </div>
        </div>
      </div>
    `);
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
      console.warn("Refs not ready—skipping event bindings.");
      return attached;
    }

    // If there’s an existing value, fill the input
    if (this.dataValue) {
      this.refs.barcode.value = this.dataValue;
    }

    if (!this.component.disabled) {
      // Manual typing → Form.io
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
      });

      // On “Scan” click, open modal + start Quagga
      this.refs.scanButton.addEventListener("click", () => {
        this.openQuaggaModal();
      });

      // On “Close” click: stop Quagga, hide modal, clear overlay
      this.refs.closeModal.addEventListener("click", () => {
        this.stopQuagga();
        this.refs.quaggaModal.style.display = "none";
        this._clearOverlay();
        this._lastBox = null;
        this._lastCode = null;
        this._videoDims = null;
        this.refs.quaggaOverlay.removeEventListener("click", this._onOverlayClick);
      });
    }

    return attached;
  }

  openQuaggaModal() {
    // 1) Show the backdrop/modal
    this.refs.quaggaModal.style.display = "flex";

    // 2) Reset any previous state
    this._lastBox = null;
    this._lastCode = null;
    this._videoDims = null;
    this._clearOverlay();

    // 3) Enable clicking on the overlay
    const overlay = this.refs.quaggaOverlay;
    overlay.style.pointerEvents = "auto";
    overlay.addEventListener("click", this._onOverlayClick);

    // 4) Function to wait until Quagga’s <video> is available and has metadata
    const onVideoReady = () => {
      const container = this.refs.quaggaContainer;
      const overlay = this.refs.quaggaOverlay;
      const video = container.querySelector("video");
      if (!video) {
        return setTimeout(onVideoReady, 50);
      }
      if (!video.videoWidth || !video.videoHeight) {
        return setTimeout(onVideoReady, 50);
      }

      // 5a) Record the camera’s actual resolution:
      this._videoDims = {
        width: video.videoWidth,   // e.g. 640
        height: video.videoHeight, // e.g. 480
      };

      // 5b) Force the <video> to fill the container, using “object-fit: contain”
      // so we can read its exact on-screen size rather than cropping:
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "contain";

      // 5c) Now that the video is laid out in a 400×300 container,
      // find out exactly where it lives and how big it is:
      const videoRect     = video.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Compute the overlay’s CSS top-left corner relative to container:
      const offsetLeft = videoRect.left - containerRect.left;
      const offsetTop  = videoRect.top  - containerRect.top;

      // 5d) Position the overlay <canvas> so that it sits exactly on top of the <video>:
      overlay.style.position = "absolute";
      overlay.style.left     = offsetLeft + "px";
      overlay.style.top      = offsetTop  + "px";
      overlay.style.width    = videoRect.width  + "px";
      overlay.style.height   = videoRect.height + "px";

      // 5e) Set the overlay’s internal drawing buffer to the RAW camera resolution,
      //     so Quagga’s raw points (0–639, 0–479) map 1:1 into this buffer:
      overlay.width  = this._videoDims.width;   // e.g. 640
      overlay.height = this._videoDims.height;  // e.g. 480

      // 5f) Now start drawing Quagga’s bounding‐box results:
      this._startQuaggaProcessing();
    };

    // 6) Initialize Quagga for 1D barcodes
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
        area: {
          top: "0%",
          right: "0%",
          left: "0%",
          bottom: "0%",
        },
      },
      locator: {
        patchSize: "large",   // helps detect thin bars
        halfSample: true,    // use full resolution
      },
      decoder: {
        readers: [
          "code_128_reader",
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
        ],
        multiple: false,
      },
      locate: true,
      numOfWorkers: 20,
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
      // Wait until the <video> is inserted and has dimensions:
      onVideoReady();
    });
  }

  _startQuaggaProcessing() {
    const overlay   = this.refs.quaggaOverlay;
    const container = this.refs.quaggaContainer;
    const videoEl   = container.querySelector("video");
    if (!videoEl || !this._videoDims) return; // safety

    // Raw camera resolution (e.g. 640×480)
    const vidW = this._videoDims.width;
    const vidH = this._videoDims.height;

    // Video’s on-screen CSS size
    const videoRect = videoEl.getBoundingClientRect();
    const cssW = videoRect.width;   // e.g. 400
    const cssH = videoRect.height;  // e.g. 300

    // Scaling factor “raw → displayed”
    const scaleX = cssW / vidW; // ~0.625
    const scaleY = cssH / vidH; // ~0.625

    window.Quagga.onProcessed((result) => {
        const ctx = overlay.getContext("2d");
        // Clear the entire raw buffer (640×480)
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // 1) Grab raw polygons (video‐pixel coords) and run them through our smoother:
        let rawBoxes = [];this._smoothedBoxes = null;
        if (result && result.boxes && result.boxes.length) {
          // Each result.boxes[k] is an array: [ [x1,y1], [x2,y2], [x3,y3], [x4,y4] ]
          rawBoxes = result.boxes.map(b => b.slice());
        }
        this._matchAndSmoothBoxes(rawBoxes);

        // 2) Draw the smoothed polygons in bright green:
        if (this._smoothedBoxes && this._smoothedBoxes.length) {
          ctx.strokeStyle = "rgba(0,255,0,1)";
          ctx.lineWidth   = 2;
          this._smoothedBoxes.forEach((box) => {
            ctx.beginPath();
            ctx.moveTo(box[0][0], box[0][1]);
            for (let i = 1; i < box.length; i++) {
              ctx.lineTo(box[i][0], box[i][1]);
            }
            ctx.closePath();
            ctx.stroke();
          });
        }
      });

      // onDetected: store the code (unchanged)
      window.Quagga.onDetected((data) => {
        this._lastCode = data.codeResult.code;
        this.refs.quaggaModal.style.border = "4px solid lime";
        setTimeout(() => {
          this.refs.quaggaModal.style.border = "";
        }, 400);
      });
    }
  

    _matchAndSmoothBoxes(rawBoxes) {
      const α = this._SMOOTH_ALPHA;      // e.g. 0.3
      const maxLost = this._MAX_LOST_FRAMES;

      // If this is the very first frame, just copy raw → smoothed:
      if (!this._smoothedBoxes) {
        this._smoothedBoxes = rawBoxes.map(b => b.slice());
        this._lostCounts     = new Array(rawBoxes.length).fill(0);
        return;
      }

      // Otherwise, we have an existing array of smoothedBoxes from the previous frame:
      const oldBoxes = this._smoothedBoxes;
      const oldLost  = this._lostCounts;
      const newSmoothed = [];
      const newLost     = [];

      // 1) Build a list of “centroids” for each raw box and each old box:
      const rawCentroids = rawBoxes.map(box => {
        const cx = (box[0][0] + box[1][0] + box[2][0] + box[3][0]) / 4;
        const cy = (box[0][1] + box[1][1] + box[2][1] + box[3][1]) / 4;
        return [cx, cy];
      });
      const oldCentroids = oldBoxes.map(box => {
        const cx = (box[0][0] + box[1][0] + box[2][0] + box[3][0]) / 4;
        const cy = (box[0][1] + box[1][1] + box[2][1] + box[3][1]) / 4;
        return [cx, cy];
      });

      // 2) Attempt to “match” each oldBox to the closest rawBox by centroid distance:
      //    We’ll build an array `matches[i] = j` meaning oldBoxes[i] ↔ rawBoxes[j].
      const usedRaw = new Set();
      const matches = new Array(oldBoxes.length).fill(-1);

      oldCentroids.forEach((oldC, i) => {
        let bestJ = -1;
        let bestDist = Infinity;
        rawCentroids.forEach((rawC, j) => {
          if (usedRaw.has(j)) return; // already claimed
          const dx = oldC[0] - rawC[0];
          const dy = oldC[1] - rawC[1];
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist) {
            bestDist = d2;
            bestJ = j;
          }
        });
        // If the best centroid distance is “too large,” we consider it “no match.”
        // Feel free to tweak this threshold (in raw‐pixel squared units).
        const MAX_CENTROID_DIST_SQ = 1000 * 1000; // ~ 1000px distance squared (very loose)
        if (bestJ >= 0 && bestDist < MAX_CENTROID_DIST_SQ) {
          matches[i] = bestJ;
          usedRaw.add(bestJ);
        }
      });

      // 3) For each oldBox:
      oldBoxes.forEach((oldBox, i) => {
        const rawIdx = matches[i];
        if (rawIdx >= 0) {
          // We found a matching rawBox → do EMA corner by corner:
          const rawBox = rawBoxes[rawIdx]; // shape: [[x1,y1],…,[x4,y4]]
          const smBox  = oldBox.slice(); // copy the old smoothed coords

          for (let k = 0; k < 4; k++) {
            smBox[k][0] = smBox[k][0] * (1 - α) + rawBox[k][0] * α;
            smBox[k][1] = smBox[k][1] * (1 - α) + rawBox[k][1] * α;
          }

          newSmoothed.push(smBox);
          newLost.push(0); // got a match, so lost=0
        } else {
          // No match → increment lost counter. If not too old, keep it:
          const lostCount = oldLost[i] + 1;
          if (lostCount < maxLost) {
            newSmoothed.push(oldBox); // keep it “as‐is” (still smoothing)
            newLost.push(lostCount);
          }
          // If lostCount ≥ maxLost, we drop this polygon permanently.
        }
      });

      // 4) For any rawBoxes that were never used (no oldBox matched to them),
      //    create a brand‐new smoothed polygon directly from raw (no EMA on first frame).
      rawBoxes.forEach((rawBox, j) => {
        if (!usedRaw.has(j)) {
          const newPoly = rawBox.map(pt => pt.slice());
          newSmoothed.push(newPoly);
          newLost.push(0);
        }
      });

      // 5) Replace our arrays:
      this._smoothedBoxes = newSmoothed;
      this._lostCounts     = newLost;
    }

  _onOverlayClick(evt) {
    // If no polygons or no code, do nothing
    if (!this._lastBoxes || !this._lastCode) return;

    const overlay   = this.refs.quaggaOverlay;
    const container = this.refs.quaggaContainer;
    const videoEl   = container.querySelector("video");
    const rect      = overlay.getBoundingClientRect();

    // Raw camera resolution
    const vidW = this._videoDims.width;   // e.g. 640
    const vidH = this._videoDims.height;  // e.g. 480

    // Video’s on-screen size
    const videoRect = videoEl.getBoundingClientRect();
    const cssW = videoRect.width;   // e.g. 400
    const cssH = videoRect.height;  // e.g. 300

    // Inverse‐scale CSS → raw
    const scaleX_inv = vidW / cssW;  // 640/400 = 1.6
    const scaleY_inv = vidH / cssH;  // 480/300 = 1.6

    // Compute the click in raw video‐pixel coordinates
    const clickX = (evt.clientX - rect.left) * scaleX_inv;
    const clickY = (evt.clientY - rect.top)  * scaleY_inv;

    // Check if (clickX, clickY) is inside ANY of the stored polygons
    for (const poly of this._lastBoxes) {
      if (this._pointInPolygon(clickX, clickY, poly)) {
        // User clicked inside one of the green boxes: insert code & close
        this.updateValue(this._lastCode);
        this.refs.barcode.value = this._lastCode;
        this.stopQuagga();
        this.refs.quaggaModal.style.display = "none";
        this._clearOverlay();
        this._lastBoxes = null;
        this._lastCode  = null;
        this._videoDims = null;
        overlay.removeEventListener("click", this._onOverlayClick);
        return; // break out of the loop
      }
    }
  }

  _pointInPolygon(x, y, poly) {
    // Standard ray-casting for point-in-polygon
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
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
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }

  stopQuagga() {
    try {
      window.Quagga.offProcessed();
      window.Quagga.offDetected();
      window.Quagga.stop();
    } catch (e) {
      // ignore if Quagga not running
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

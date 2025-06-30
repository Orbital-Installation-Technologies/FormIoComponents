import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

const FieldComponent = Components.components.field;

export default class ReviewButton extends FieldComponent {
  static editForm = editForm;

  static schema(...extend) {
    return FieldComponent.schema(
      {
        type: "reviewbutton",
        label: "Review and Submit",
        key: "reviewButton",
        input: false,
      },
      ...extend,
    );
  }

  static get builderInfo() {
    return {
      title: "Review Button",
      group: "basic",
      icon: "eye",
      weight: 10,
      documentation: "",
      schema: ReviewButton.schema(),
    };
  }

  constructor(component, options, data) {
    super(component, options, data);
  }

  init() {
    super.init();
  }

  conditionallyHidden(data) {
    if (!this.component.customConditional) return false;
    try {
      return !this.evaluate(
        this.component.customConditional,
        {
          ...this.data,
          ...data,
        },
        this.data,
      );
    } catch (e) {
      console.warn("Conditional logic error:", e);
      return false;
    }
  }

  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", () => {
      const allData = this.root.getValue();
      const noShow = allData?.data?.noShow;
      const supportNumber = allData?.data?.billingCustomer || "Unavailable";

      if (noShow === "yes") {
        const confirmed = confirm("Are you sure you want to submit without verification?");
        if (confirmed) {
          this.emit("submitButton", { type: "submit" });
        }
        return;
      }

      const visibleFields = this.root?.components?.filter(
        (comp) =>
          comp.component.reviewVisible &&
          comp.visible !== false &&
          !["button", "hidden", "file", "image"].includes(comp.component.type),
      );

      const reviewHtml = visibleFields
        .map((comp) => {
          const key = comp.component.key;
          const label = comp.component.label || key;
          const value = comp.getValue();
          if (Array.isArray(value)) {
            return `
              <div><strong>${label}:</strong></div>
              <ol style="padding-left: 1.5rem;">
                ${value
                  .map((item, index) => {
                    const itemData = item.form?.data || {};
                    return `
                      <li style="margin-bottom: 0.5rem;">
                        <div><strong>Item ${index + 1}:</strong></div>
                        ${Object.entries(itemData)
                          .map(([nestedKey, nestedValue]) => {
                            return `<div><strong>${nestedKey}:</strong> ${nestedValue || ""}</div>`;
                          })
                          .join("")}
                      </li>
                    `;
                  })
                  .join("")}
              </ol>
            `;
          }
          return `<div><strong>${label}:</strong> ${value ?? ""}</div>`;
        })
        .join("");

      const modal = document.createElement("div");
      modal.style.zIndex = "1000";
      modal.className =
        "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";

      modal.innerHTML = `
        <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>
          <div class="mb-4 text-sm" style="max-height:200px; overflow-y:auto; border:1px solid #ccc; padding:8px;">
            ${reviewHtml}
          </div>
          <div class="flex space-x-4 mb-4">
            <div class="text-sm w-1/2">
              <label class="block font-medium mb-1">Support Number</label>
              <input type="text" id="supportNumber" class="w-full border rounded p-2 text-sm bg-gray-100" value="${supportNumber}" disabled />
            </div>
            <div class="text-sm w-1/2">
              <label class="block font-medium mb-1">Verified</label>
              <select id="verified" class="w-full border rounded p-2 text-sm">
                <option value="">Select verification type</option>
                <option value="App">App</option>
                <option value="Support">Support</option>
                <option value="Not Verified">Not Verified</option>
              </select>
            </div>
          </div>
          <div class="mb-4 text-sm w-full" id="screenshotWrapper" style="display: none;">
            <label class="block font-medium mb-1">Screenshot Upload<span class="text-red-500">(Required)*</span></label>
            <input type="file" id="screenshot" class="w-full text-sm" />
          </div>
          <div class="mb-4 text-sm w-full" id="notesOptionalWrapper" style="display: none;">
            <label class="block font-medium mb-1">Notes (optional)</label>
            <textarea id="notesOptional" class="w-full border rounded p-2 text-sm"></textarea>
          </div>
          <div class="mb-4 text-sm w-full" id="notesRequiredWrapper" style="display: none;">
            <label class="block font-medium mb-1">Explain why not verified<span class="text-red-500">(Required)*</span></label>
            <textarea id="notesRequired" class="w-full border rounded p-2 text-sm"></textarea>
          </div>
          <div class="mt-4 flex justify-end space-x-4">
            <button class="px-4 py-2 btn btn-primary rounded" id="cancelModal">Cancel</button>
            <button class="px-4 py-2 btn btn-primary rounded" id="submitModal">Submit</button>
          </div>
        </div>`;

      document.body.appendChild(modal);

      const verifiedSelect = modal.querySelector("#verified");
      const screenshotWrapper = modal.querySelector("#screenshotWrapper");
      const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
      const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");

      verifiedSelect.onchange = () => {
        const value = verifiedSelect.value;
        screenshotWrapper.style.display = value === "App" || value === "Support" ? "block" : "none";
        notesOptionalWrapper.style.display =
          value === "App" || value === "Support" ? "block" : "none";
        notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
      };

      modal.querySelector("#cancelModal").onclick = () => {
        document.body.removeChild(modal);
      };

      modal.querySelector("#submitModal").onclick = async () => {
        const verifiedSelectValue = modal.querySelector("#verified").value;
        const notesRequired = modal.querySelector("#notesRequired").value;
        const notesOptional = modal.querySelector("#notesOptional").value;
        const screenshotInput = modal.querySelector("#screenshot");
        const screenshot = screenshotInput.files.length > 0 ? screenshotInput.files[0] : null;
        const supportNumber = modal.querySelector("#supportNumber").value;

        // Conditional validation for modal fields
        if (verifiedSelectValue === "Not Verified" && !notesRequired.trim()) {
          alert("Please explain why not verified.");
          return;
        }
        if ((verifiedSelectValue === "App" || verifiedSelectValue === "Support") && !screenshot) {
          alert("Screenshot is required for App or Support verification.");
          return;
        }

        // Always save form values first
        const updatedData = {
          ...this.root.getValue(),
          supportNumber,
          verifiedSelect: verifiedSelectValue,
          screenshot,
          notesOptional,
          notesRequired,
        };
        this.root.setValue(updatedData);

        // Store latest modal data into component state for reuse
        this.component._reviewModalCache = {
          verifiedSelect: verifiedSelectValue,
          notesRequired,
          notesOptional,
          supportNumber,
        };

        const noShow = updatedData.data?.noShow;
        const requireValidation = noShow === "no";

        if (requireValidation) {
          const isValid = await this.root.checkValidity(updatedData.data, true);
          if (!isValid) {
            this.root.showErrors();
            alert("Some fields are invalid. Please fix them before submitting.");
            return;
          }
        }

        document.body.removeChild(modal);
        this.resetAfterNextSubmit();
        this.emit("submitButton", { type: "submit" });
      };

      // Restore cached modal values if available
      const cached = this.component._reviewModalCache;
      if (cached) {
        modal.querySelector("#verified").value = cached.verifiedSelect || "";
        modal.querySelector("#notesRequired").value = cached.notesRequired || "";
        modal.querySelector("#notesOptional").value = cached.notesOptional || "";
        modal.querySelector("#supportNumber").value = cached.supportNumber || "Unavailable";
        verifiedSelect.dispatchEvent(new Event("change"));
      }
    });

    return super.attach(element);
  }

  resetAfterNextSubmit() {
    if (this._waitingReset) return; // guard against re-registration
    this._waitingReset = true;

    const doReset = () =>
      setTimeout(() => {
        // let the toast mount first
        this._waitingReset = false;
        this.component._reviewModalCache = null;

        /* Clear absolutely everything */
        this.root.resetValue(); // wipes values + sets defaults

        /* Make sure the UI is clean */
        this.root.setPristine(true);
        this.root.clearErrors();
        this.root.everyComponent((c) => {
          c.setPristine(true); // remove red borders
          c.error = null;
        });
      }, 50); // 50 ms for Toastify

    if (typeof this.root.once === "function") {
      this.root.once("submitDone", doReset);
    } else {
      const fn = () => {
        this.root.off("submitDone", fn);
        doReset();
      };
      this.root.on("submitDone", fn);
    }
  }
}

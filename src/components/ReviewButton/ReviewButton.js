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
    this.root.on("submitDone", () => {
      window.location.reload();
    });
  }

  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {

      // Force a redraw and wait a moment for any pending updates to be applied
      try {
        this.root.redraw();
        // Small delay to ensure all components are updated
        await new Promise(resolve => setTimeout(resolve, 100));
        // Special handling for Hardware List datagrids - find and update them first
        const hardwareComponents = this.root.components.filter(comp => 
          comp.component.type === 'datagrid' && 
          (comp.component.key === 'hardwareList' || comp.component.label?.includes('Hardware'))
        );
        if (hardwareComponents.length > 0) {
          // Process each hardware component first
          for (const hardware of hardwareComponents) {
            try {
              // Force update the datagrid itself
              if (hardware.updateValue) {
                hardware.updateValue();
              }
              // Make sure all rows are updated
              if (hardware.rows) {
                hardware.rows.forEach((row, idx) => {
                  Object.values(row).forEach(component => {
                    if (component && component.updateValue) {
                      component.updateValue();
                    }
                  });
                });
              }
            } catch (e) {
              // Silent error handling
            }
          }
        }
        // Then update all other components
        this.root.components.forEach(comp => {
          if (comp.updateValue && typeof comp.updateValue === 'function') {
            try {
              comp.updateValue();
            } catch (e) {
              // Silent error handling
            }
          }
        });
      } catch (e) {
        // Silent error handling
      }

      // Utility to find all reviewVisible & visible components recursively
      async function findReviewVisibleComponents(webformOrComp) {
        const results = [];
        const enqueue = (c) => queue.push(c);
        const startForm = webformOrComp.subForm ? webformOrComp.subForm : webformOrComp;
        if (startForm.ready) await startForm.ready;
        const queue = [];
        startForm.everyComponent(enqueue);
        while (queue.length) {
          const comp = queue.shift();
          if (comp?.component?.reviewVisible === true && comp.visible !== false) {
            results.push(comp);
          }
          if (comp.type === 'form') {
            if (comp.subFormReady) await comp.subFormReady;
            if (comp.subForm) {
              comp.subForm.everyComponent(enqueue);
            }
          }
          if (comp.component?.type === 'datagrid' && comp.rows) {
            comp.rows.forEach(row => {
              Object.values(row).forEach(child => child && enqueue(child));
            });
          }
          if (comp.component?.type === 'editgrid' && comp.editRows?.length) {
            comp.editRows.forEach(r => (r.components || []).forEach(enqueue));
          }
          if (Array.isArray(comp.components) && comp.components.length) {
            comp.components.forEach(enqueue);
          }
        }
        return results;
      }

      // Get the latest data after refresh
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

      // Find all reviewVisible & visible components
      const visibleFields = await findReviewVisibleComponents(this.root);
      console.log("Reviewable fields:", visibleFields.map(c => ({ key: c.key, type: c.component.type })));

      const reviewHtml = visibleFields
        .map((comp) => {
          const key = comp.component.key;
          const label = comp.component.label || key;
          const value = comp.getValue();
          console.log("123123123123 value", value)


          if (value === null || value === "") return "";

          // Regular expression to identify internal/helper keys for top-level objects
          const INTERNAL_KEY_RE = /(DataSource|isDataSource|_raw|_meta|Controls)$/i;

          // Re-use the renderNestedValue function for top-level values as well
          const renderNestedValue = (value, depth = 0, itemComponents = []) => {
            if (value === null || value === undefined || value === "") {
              return "";
            }
            if (typeof value === 'object' && !Array.isArray(value)) {
              if (Object.keys(value).some(k => INTERNAL_KEY_RE.test(k))) {
                const rootKeys = Object.keys(value).filter(k => !INTERNAL_KEY_RE.test(k));
                if (rootKeys.length > 0) {
                  return rootKeys.map(key => {
                    const val = value[key];
                    let show = true;
                    if (itemComponents && Array.isArray(itemComponents)) {
                      const nestedComponent = itemComponents.find(
                        c => c.component?.key === key || c.key === key
                      );
                      if (nestedComponent) {
                        show = nestedComponent.component?.reviewVisible === true && nestedComponent.visible !== false;
                      }
                      console.log("nestedComponent:", nestedComponent);
                    }
                    console.log("itemComponents:", itemComponents);
                    if (!show) return "";
                    return `
                    <div style="margin-left: ${depth * 15}px; padding-left: 10px;">
                      <strong>6${key}:</strong> ${String(val)}
                    </div>`;
                  }).join("");
                }
                return "No data available";
              }
              const nestedEntries = Object.entries(value).filter(([key, val]) => {
                if (INTERNAL_KEY_RE.test(key)) return false;
                return val !== null && val !== undefined || (typeof val === 'number' && val === 0) || val === false;
              });
              if (nestedEntries.length === 0) return "";
              return nestedEntries.map(([key, val]) => {
                const renderedValue = renderNestedValue(val, depth + 1, itemComponents);
                if (!renderedValue && typeof val !== 'number' && val !== false && val !== 0) return "";
                const displayValue = (typeof val !== 'object' || val === null) ? String(val) : renderedValue;
                if (key == "dataGrid" || key == "data") {
                  return `
                  <div style="margin-left: 0; padding-left: 0; border-left: 1px dotted #ccc;">
                    ${displayValue}
                  </div>`;
                }
                return `
                  <div style="margin-left: ${depth * 15}px; padding-left: 10px; border-left: 1px dotted #ccc;">
                    <strong>7${key}:</strong> ${displayValue}
                  </div>`;
              }).join("");
            } else if (Array.isArray(value)) {
              if (value.length === 0) return "";
              if (typeof value[0] === 'object' && value[0] !== null) {
                return `
                <div style="margin-left: ${depth * 15}px;">
                  <ul style="list-style-type: circle; margin-left: ${depth * 10}px; padding-left: 15px;">
                    ${value.map((item, idx) => `
                      <li>Item ${idx + 1}:
                        ${renderNestedValue(item, depth + 1, itemComponents)}
                      </li>
                    `).join("")}
                  </ul>
                </div>`;
              } else {
                return value.join(", ");
              }
            } else {
              return String(value);
            }
          };

          return `<div><strong>8${label}:</strong> ${renderNestedValue(value)}</div>`;
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
            <label for="screenshotContainer">Screenshot Upload<span class="text-red-500">(Required)*</label>
            <div id="screenshotContainer"></div>
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

      //Input file component into review modal
      const screenshotComp = this.root.getComponent("screenshot");
      if (screenshotComp) {
        screenshotComp.component.hidden = false;
        screenshotComp.visible = true;

        const html = screenshotComp.render();

        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const compEl = tmp.firstElementChild;

        const container = modal.querySelector("#screenshotContainer");
        container.appendChild(compEl);

        screenshotComp.attach(compEl);
      }

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
        const screenshotComp = this.root.getComponent("screenshot");
        if (screenshotComp) {
          screenshotComp.component.hidden = true;
          if (typeof screenshotComp.setVisible === "function") {
            screenshotComp.setVisible(false);
          } else {
            screenshotComp.visible = false;
          }
          this.root.redraw();
        }

        document.body.removeChild(modal);
      };

      modal.querySelector("#submitModal").onclick = async () => {
        const verifiedSelectValue = modal.querySelector("#verified").value;
        const notesRequired = modal.querySelector("#notesRequired").value;
        const notesOptional = modal.querySelector("#notesOptional").value;
        const supportNumber = modal.querySelector("#supportNumber").value;
        const screenshotComp = this.root.getComponent("screenshot");
        const uploadedFiles = screenshotComp.getValue() || [];

        if (verifiedSelectValue === "Not Verified" && !notesRequired.trim()) {
          alert("Please explain why not verified.");
          return;
        }
        if (
          (verifiedSelectValue === "App" || verifiedSelectValue === "Support") &&
          uploadedFiles.length === 0
        ) {
          alert("Screenshot is required for App or Support verification.");
          return;
        }

        this.root.getComponent("reviewed")?.setValue("true");
        this.root.getComponent("supportNumber")?.setValue(supportNumber);
        this.root.getComponent("verifiedSelect")?.setValue(verifiedSelectValue);
        this.root.getComponent("notesOptional")?.setValue(notesOptional);
        this.root.getComponent("notesRequired")?.setValue(notesRequired);

        this.component._reviewModalCache = {
          verifiedSelect: verifiedSelectValue,
          notesRequired,
          notesOptional,
          supportNumber,
        };

        const requireValidation = noShow === "no";

        if (requireValidation) {
          const isValid = await this.root.checkValidity(this.root.getValue().data, true);
          if (!isValid) {
            this.root.showErrors();
            alert("Some fields are invalid. Please fix them before submitting.");
            return;
          }
        }

        document.body.removeChild(modal);
        this.emit("submitButton", { type: "submit" });
      };

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
}

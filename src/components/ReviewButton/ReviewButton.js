import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

// Add an immediate console log to verify the file is loaded
console.log("ReviewButton component file loaded");

const FieldComponent = Components.components.field;

export default class ReviewButton extends FieldComponent {
  static editForm = editForm;

  static schema(...extend) {
    console.log("ReviewButton schema method called");
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
    // Add console log with alert to ensure we see it
    console.log("ReviewButton constructor called");
    try {
      // Create a temporary alert to confirm the component is being instantiated
      // Comment this out after debugging
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert("ReviewButton component initialized");
        }
      }, 1000);
    } catch (e) {
      console.error("Alert error:", e);
    }
  }

  init() {
    super.init();
    console.log("ReviewButton init called");
    try {
      console.error("REVIEWBUTTON INIT: This should appear in console even in production");
    } catch (e) {
      console.error("Error in init:", e);
    }
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
    console.log("ReviewButton attach called");
    console.error("REVIEWBUTTON ATTACH: This should appear in console even in production");
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", () => {
      console.error("REVIEWBUTTON BUTTON CLICKED");
      const allData = this.root.getValue();
      console.log("alldata", allData)
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
          console.log("ReviewButton - processing component:", key, value, comp);

          if (Array.isArray(value)) {
            return `
    <div><strong>${label}:</strong></div>
    <ol style="padding-left: 1.5rem;">
      ${value
        .map((item, index) => {
          // Prefer direct item data
          const row = item.data || item.form?.data || item;
          
          const itemComponents =
            comp?.components?.[index]?.components || comp.component.components || [];
            
          // Regular expression to identify internal/helper keys
          const INTERNAL_KEY_RE = /(DataSource|isDataSource|_raw|_meta|Controls)$/i;

          const filteredEntries = Object.entries(row).filter(([nestedKey, nestedValue]) => {
            // Skip internal/datasource fields
            if (INTERNAL_KEY_RE.test(nestedKey)) return false;
            
            // Skip null/empty values but allow 0 and false
            if (nestedValue === null || nestedValue === undefined || 
                (typeof nestedValue === 'string' && nestedValue === "")) return false;
            
            const nestedComponent = itemComponents.find(
              (c) => c.component?.key === nestedKey || c.key === nestedKey,
            );

            const nestedType = nestedComponent?.component?.type || nestedComponent?.type || "";
            const keyLower = nestedKey.toLowerCase();

            const likelyImageByName =
              keyLower.includes("pic") || keyLower.includes("photo") || keyLower.includes("image");
              
            // We'll handle arrays, but skip likely image fields
            return nestedType !== "image" && !likelyImageByName;
          });

          // Function to recursively process nested objects - for array items
          const renderNestedValue = (value, depth = 0) => {
            if (value === null || value === undefined || value === "") {
              return "";
            }
            
            // Skip internal objects
            if (typeof value === 'object' && !Array.isArray(value)) {
              // Don't traverse into DataSource objects
              if (Object.keys(value).some(k => INTERNAL_KEY_RE.test(k))) {
                return "(internal data)";
              }
              
              // Handle object
              const nestedEntries = Object.entries(value).filter(([key, val]) => {
                // Skip internal/helper keys
                if (INTERNAL_KEY_RE.test(key)) return false;
                return val !== null && val !== undefined || 
                  (typeof val === 'number' && val === 0) || 
                  val === false;
              });
              
              if (nestedEntries.length === 0) return "";
              
              return nestedEntries.map(([key, val]) => {
                const renderedValue = renderNestedValue(val, depth + 1);
                if (!renderedValue && typeof val !== 'number' && val !== false && val !== 0) return "";
                
                const displayValue = (typeof val !== 'object' || val === null) ? 
                  String(val) : renderedValue;
                  
                return `
                  <div style="margin-left: ${depth * 15}px; padding-left: 10px; border-left: 1px dotted #ccc;">
                    <strong>${key}:</strong> ${displayValue}
                  </div>`;
              }).join("");
            } else if (Array.isArray(value)) {
              // Handle array of objects
              if (value.length === 0) return "";
              
              if (typeof value[0] === 'object' && value[0] !== null) {
                return `
                <div style="margin-left: ${depth * 15}px;">
                  <ul style="list-style-type: circle; margin-left: ${depth * 10}px; padding-left: 15px;">
                    ${value.map((item, idx) => `
                      <li>Item ${idx + 1}:
                        ${renderNestedValue(item, depth + 1)}
                      </li>
                    `).join("")}
                  </ul>
                </div>`;
              } else {
                // Simple array values
                return value.join(", ");
              }
            } else {
              // Simple value
              return String(value);
            }
          };
          
          // Always show items even if empty (just with default text)
          if (filteredEntries.length === 0) {
            return `
              <li style="margin-bottom: 0.8rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
                <div style="font-weight: bold; font-size: 1.05em; margin-bottom: 5px;">Item ${index + 1}</div>
                <div style="padding-left: 15px;"><em>No detailed information available</em></div>
              </li>
            `;
          }

          return `
            <li style="margin-bottom: 0.8rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
              <div style="font-weight: bold; font-size: 1.05em; margin-bottom: 5px;">Item ${index + 1}</div>
              <div style="padding-left: 15px;">
                ${filteredEntries
                  .map(
                    ([nestedKey, nestedValue]) =>
                      `<div style="margin-bottom: 4px;"><strong>${nestedKey}:</strong> ${renderNestedValue(nestedValue)}</div>`
                  )
                  .join("")}
              </div>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
          }

          if (value === null || value === "") return "";
          
          // Regular expression to identify internal/helper keys for top-level objects
          const INTERNAL_KEY_RE = /(DataSource|isDataSource|_raw|_meta|Controls)$/i;
          
          // Re-use the renderNestedValue function for top-level values as well
          const renderNestedValue = (value, depth = 0) => {
            if (value === null || value === undefined || value === "") {
              return "";
            }
            
            if (typeof value === 'object' && !Array.isArray(value)) {
              // Don't traverse into DataSource objects
              if (Object.keys(value).some(k => INTERNAL_KEY_RE.test(k))) {
                return "(internal data)";
              }
              
              // Handle object
              const nestedEntries = Object.entries(value).filter(([key, val]) => {
                // Skip internal/helper keys
                if (INTERNAL_KEY_RE.test(key)) return false;
                return val !== null && val !== undefined || 
                  (typeof val === 'number' && val === 0) || 
                  val === false;
              });
              
              if (nestedEntries.length === 0) return "";
              
              return nestedEntries.map(([key, val]) => {
                const renderedValue = renderNestedValue(val, depth + 1);
                // Allow zero values and boolean false values to display
                if (!renderedValue && typeof val !== 'number' && val !== false && val !== 0) return "";
                
                const displayValue = (typeof val !== 'object' || val === null) ? 
                  String(val) : renderedValue;
                  
                return `
                  <div style="margin-left: ${depth * 15}px; padding-left: 10px; border-left: 1px dotted #ccc;">
                    <strong>${key}:</strong> ${displayValue}
                  </div>`;
              }).join("");
            } else if (Array.isArray(value)) {
              // Handle array of objects
              if (value.length === 0) return "";
              
              if (typeof value[0] === 'object' && value[0] !== null) {
                return `
                <div style="margin-left: ${depth * 15}px;">
                  <ul style="list-style-type: circle; margin-left: ${depth * 10}px; padding-left: 15px;">
                    ${value.map((item, idx) => `
                      <li>Item ${idx + 1}:
                        ${renderNestedValue(item, depth + 1)}
                      </li>
                    `).join("")}
                  </ul>
                </div>`;
              } else {
                // Simple array values
                return value.join(", ");
              }
            } else {
              // Simple value
              return String(value);
            }
          };
          
          return `<div><strong>${label}:</strong> ${renderNestedValue(value)}</div>`;
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

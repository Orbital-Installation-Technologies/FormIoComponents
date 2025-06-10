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
      console.log(allData);

      const noShow = allData["data"]["noShow"];

      if (noShow === "yes") {
        const confirmed = confirm("Are you sure you want to submit without verification?");
        if (confirmed) {
          this.emit("submitButton", { type: "submit" });
        }
        return;
      }

      const modal = document.createElement("div");
      modal.style.zIndex = "1000";
      modal.className =
        "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";

      modal.innerHTML = `
        <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>

          <div class="mb-4 text-sm" style="max-height:200px; overflow-y:auto; border:1px solid #ccc; padding:8px;">
            ${Object.keys(allData.data)
              .map((key) => {
                // Check if the value is an array, such as hardwareList, and handle accordingly
                const value = allData.data[key];
                if (Array.isArray(value)) {
                  return `
                    <div><strong>${key}:</strong></div>
                    <ol style="padding-left: 1.5rem;">
                      ${value
                        .map((item, index) => {
                          const itemData = item.form?.data || {}; // Extract nested data
                          return `
                            <li style="margin-bottom: 0.5rem;">
                              <div><strong>Item ${index + 1}:</strong></div>
                              ${Object.keys(itemData)
                                .map((nestedKey) => {
                                  return `<div><strong>${nestedKey}:</strong> ${itemData[nestedKey] || ""}</div>`;
                                })
                                .join("")}
                            </li>
                          `;
                        })
                        .join("")}
                    </ol>
                  `;
                } else {
                  // Display regular fields
                  return `<div><strong>${key}:</strong> ${value || ""}</div>`;
                }
              })
              .join("")}
          </div>

          <div class="flex items-center space-x-3 mb-4">
            <input type="text" class="flex-1 border rounded p-2 text-sm" placeholder="Support number" id="supportNumber" />
            <select class="flex-1 border rounded p-2 text-sm" id="verified">
              <option value="">Verified (Yes/No)</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
            <input type="file" class="flex-1 text-sm" id="screenshot" />
          </div>

          <div class="mt-4 flex justify-end space-x-4">
            <button class="px-4 py-2 btn btn-primary rounded" id="cancelModal">Cancel</button>
            <button class="px-4 py-2 btn btn-primary rounded" id="submitModal">Submit</button>
          </div>
        </div>`;

      document.body.appendChild(modal);

      modal.querySelector("#cancelModal").onclick = () => {
        document.body.removeChild(modal);
      };

      modal.querySelector("#submitModal").onclick = () => {
        const supportNumber = modal.querySelector("#supportNumber").value;
        const verified = modal.querySelector("#verified").value;
        const screenshot = modal.querySelector("#screenshot").files[0];

        // Only require fields if noShow is specifically "No"
        if (noShow === "no") {
          if (!supportNumber || !verified || !screenshot) {
            alert("Please complete all verification fields.");
            return;
          }

          this.root.setValue({
            ...allData,
            supportNumber,
            verified,
            screenshot,
          });
        }

        document.body.removeChild(modal);
        this.emit("submitButton", { type: "submit" });
      };
    });

    return super.attach(element);
  }
}

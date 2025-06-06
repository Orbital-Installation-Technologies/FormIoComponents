import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

const FieldComponent = Components.components.button;

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

  render(content) {
    return super.render(
      `<button ref="button" class="btn btn-primary">${this.component.label}</button>`,
    );
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", () => {
      const allData = this.root.getValue();
      const noShow = allData["data"]["noShow"];

      if (noShow === "yes") {
        this.emit("submitButton", { type: "submit" });
        return;
      }

      const modal = document.createElement("div");
      modal.className =
        "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";

      modal.innerHTML = `
        <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>

          <div class="mb-4 text-sm whitespace-pre-wrap" style="max-height:200px; overflow-y:auto; border:1px solid #ccc; padding:8px;">
            ${Object.entries(allData)
              .filter(([key]) => key === "data") // only keep "data" key
              .map(
                ([key, val]) =>
                  `<div><strong>${key}</strong>: ${typeof val === "object" ? JSON.stringify(val) : val}</div>`,
              )
              .join("")}
          </div>

          <div class="space-y-4 mb-4">
            <label class="block">
              <span class="text-gray-700">Support Confirmation Number</span>
              <input type="text" class="w-full border rounded p-2 mt-1" id="supportNumber" />
            </label>
            <label class="block">
              <span class="text-gray-700">Verified Successfully?</span>
              <select id="verified" class="w-full border rounded p-2 mt-1">
                <option value="">Select</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
            <label class="block">
              <span class="text-gray-700">Screenshot Upload</span>
              <input type="file" id="screenshot" class="w-full mt-1" />
            </label>
          </div>

          <div class="mt-4 flex justify-end space-x-4">
            <button class="px-4 py-2 bg-gray-300 rounded" id="cancelModal">Cancel</button>
            <button class="px-4 py-2 bg-blue-600 text-black rounded" id="submitModal">Submit</button>
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
        if (noShow === "No") {
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

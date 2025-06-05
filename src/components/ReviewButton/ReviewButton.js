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
        input: true,
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

      if (allData["noShow"] === "Yes") {
        this.emit("submitButton", { type: "submit" });
        return;
      }

      const modal = document.createElement("div");
      modal.className =
        "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";
      modal.innerHTML = `
        <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>

          <div class="mt-4 flex justify-end space-x-4">
            <button class="px-4 py-2 bg-gray-300 rounded" id="cancelModal">Cancel</button>
            <button class="px-4 py-2 bg-blue-600 text-white rounded" id="submitModal">Submit</button>
          </div>
        </div>`;

      document.body.appendChild(modal);

      modal.querySelector("#cancelModal").onclick = () => document.body.removeChild(modal);

      modal.querySelector("#submitModal").onclick = () => {
        document.body.removeChild(modal);
        this.emit("submitButton", { type: "submit" });
      };
    });

    return super.attach(element);
  }
}

import { Components } from "@formio/js";
import CustomSelectEditForm from "./CustomSelect.form";

const SelectComponent = Components.components.select;

export default class CustomSelect extends SelectComponent {
  static editForm(...extend) {
    return CustomSelectEditForm(...extend);
  }

  static schema(...extend) {
    return SelectComponent.schema(...extend);
  }

  constructor(...args) {
    super(...args);
  }

  attach(element) {
    const result = super.attach(element);

    // Function to adjust the error icon
    const adjustErrorIcon = () => {
      // Look for the error icon inside the parent of the element
      const errorIcon = element.parentNode.querySelector(
        '.form-control.ui.fluid.selection.dropdown.is-invalid'
      );

      console.log("errorIcon ==", errorIcon)
      if (errorIcon) {
        errorIcon.style.backgroundPosition = 'calc(100% - 1.5rem) calc(50% - 1px)';
      }
    };
    adjustErrorIcon();

    // Watch for changes in the DOM (Form.io may inject the icon later)
    const observer = new MutationObserver(() => adjustErrorIcon());
    observer.observe(element.parentNode, { childList: true, subtree: true });

    return result;
  }
}

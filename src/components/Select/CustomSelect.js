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

    // Store observer for cleanup
    this.errorIconObserver?.disconnect();
    // Function to adjust the error icon
    const adjustErrorIcon = () => {
      // Look for the error icon inside the parent of the element
      const errorIcon = element.parentNode.querySelector(
        '.form-control.ui.fluid.selection.dropdown.is-invalid'
      );

      if (errorIcon) {
        errorIcon.style.backgroundPosition = 'calc(100% - 1.5rem) calc(50% - 0.5px)';
      }
    };
    adjustErrorIcon();
    if (element.parentNode) {
      this.errorIconObserver = new MutationObserver(() => adjustErrorIcon());
      this.errorIconObserver.observe(element.parentNode, { childList: true, subtree: true });
    }

    // DYNAMIC DROPDOWN HEIGHT BASED ON SCREEN
    this.dropdownObserver?.disconnect();
    const choicesInstance = this.choices || this._choices;

    if (choicesInstance) {
      const observer = new MutationObserver(() => {
        const dropdown = element.querySelector(
          '.choices__list.choices__list--dropdown.is-active'
        );
        if (!dropdown) return;

        // Use the .choices container for width/position reference
        const choicesEl = element.querySelector('.choices');
        const refEl = choicesEl || element;

        // Make dropdown overlay content; pin left so empty/no-results state doesn't offset right
        dropdown.style.position = 'absolute';
        dropdown.style.left = '0';
        dropdown.style.right = 'auto';
        dropdown.style.zIndex = 9999;
        dropdown.style.width = `${refEl.offsetWidth}px`;

        const rect = refEl.getBoundingClientRect();
        const margin = 10; // Safe margin

        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;

        let maxHeight = 400;

        // Small screen / rotated landscape adjustment
        const smallScreenThreshold = 400; // pixels, adjust if needed
        if (window.innerHeight < smallScreenThreshold) {
          maxHeight = Math.min(spaceBelow,200); // limit max-height to 200px for tiny screens
        }

        // Open upwards if more space above
        if (spaceBelow < 200 && spaceAbove > spaceBelow) {
          maxHeight = Math.min(spaceAbove, maxHeight);
          dropdown.style.top = 'auto';
          dropdown.style.bottom = `${refEl.offsetHeight}px`; // open upward
        } else {
          dropdown.style.top = '100%'; // restore Choices.js default
          dropdown.style.bottom = 'auto'; // open downward
        }

        dropdown.style.maxHeight = `${maxHeight}px`;
        dropdown.style.overflowY = 'auto';
      });

      observer.observe(element, { childList: true, subtree: true });
      this.dropdownObserver = observer;
    }

    return result;
  }
  detach() {
    this.errorIconObserver?.disconnect();
    this.dropdownObserver?.disconnect();
    return super.detach();
  }
}

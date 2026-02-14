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

    // Use Static CSS for Error Icons
    // Instead of a MutationObserver watching for class changes, we inject a CSS rule.
    // This is significantly more performant as the browser handles the styling natively.
    if (!document.getElementById('customSelectStyles')) {
      const style = document.createElement('style');
      style.id = 'customSelectStyles';
      style.innerHTML = `
        .form-control.ui.fluid.selection.dropdown.is-invalid {
          background-position: calc(100% - 1.5rem) calc(50% - 0.5px) !important;
        }
       
        .choices {
          position: relative !important;
          overflow: visible !important;
        }
        .choices__list--dropdown {
          position: absolute !important;
          top: 100% !important; /* Forces it right below the input */
          left: 0 !important;
          width: 100% !important;
          z-index: 10000 !important;
        }
      `;
      document.head.appendChild(style);
    }

    //  Replace MutationObserver with Choices.js Events
    // Choices.js (the engine Form.io uses) emits events when the dropdown opens.
    const choicesInstance = this.choices || this._choices;

    if (choicesInstance && choicesInstance.passedElement) {
      // We listen specifically for the 'showDropdown' event
      choicesInstance.passedElement.element.addEventListener('showDropdown', () => {
        this.adjustDropdownLogic(element, choicesInstance);
      });
    }

    return result;
  }


  adjustDropdownLogic(element, choicesInstance) {
    const dropdown = choicesInstance.containerOuter.element.querySelector(
      '.choices__list--dropdown'
    );
    
    if (!dropdown) return;

    // Apply your dynamic height and positioning logic
    dropdown.style.width = `${element.offsetWidth}px`;

    const rect = element.getBoundingClientRect();
    const margin = 10;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    let maxHeight = 400;

    // Small screen adjustment
    if (window.innerHeight < 400) {
      maxHeight = Math.min(spaceBelow, 200);
    }

    // Directional logic (Upward vs Downward)
    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(spaceAbove, maxHeight);
      dropdown.style.bottom = `${rect.height}px`; // Open upward
      dropdown.style.top = 'auto';
    } else {
      dropdown.style.bottom = 'auto'; // Open downward
      dropdown.style.top = '100%';
    }

    dropdown.style.maxHeight = `${maxHeight}px`;
    dropdown.style.overflowY = 'auto';
  }

  detach() {

    return super.detach();
  }
}

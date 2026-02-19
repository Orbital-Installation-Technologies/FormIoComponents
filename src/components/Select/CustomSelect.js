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
    // Bind the method once to ensure the reference is stable for removeEventListener
    this.onShowDropdown = this.onShowDropdown.bind(this);
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

    if (choicesInstance && choicesInstance.passedElement && choicesInstance?.passedElement?.element) {
      // We listen specifically for the 'showDropdown' event
      this.choicesElement = choicesInstance.passedElement.element;
      this.choicesElement.addEventListener('showDropdown', this.onShowDropdown);
    }

    return result;
  }
  // Wrapper to handle the event reference
  onShowDropdown() {
    const choicesInstance = this.choices || this._choices;
    if (choicesInstance) {
      // 3. RequestAnimationFrame: Move DOM reads/writes to the next browser paint
      // This prevents "Jank" and reduces CPU overhead
      window.requestAnimationFrame(() => {
        this.adjustDropdownLogic(this.element, choicesInstance);
      });
    }
  }

  adjustDropdownLogic(element, choicesInstance) {
    if (!element || !choicesInstance.containerOuter?.element) return;
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

    // Use CSS classes to toggle direction instead of manual 'top/bottom' strings
    // This allows the browser to optimize the render tree
    const isUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    // Small screen adjustment
    if (window.innerHeight < 400) {
      maxHeight = Math.min(spaceBelow, 200);
    }


    if (isUpward) {
      choicesInstance.containerOuter.element.classList.add('is-flipped');
      dropdown.style.maxHeight = `${Math.min(spaceAbove, 400)}px`;
    } else {
      choicesInstance.containerOuter.element.classList.remove('is-flipped');
      dropdown.style.maxHeight = `${Math.min(spaceBelow, 400)}px`;
    }

   
    dropdown.style.overflowY = 'auto';
  }

  detach() {
    // 5. CRITICAL: Remove the listener to stop battery drain from memory leaks
    if (this.choicesElement) {
      this.choicesElement.removeEventListener('showDropdown', this.onShowDropdown);
    }
    return super.detach();
  }
}

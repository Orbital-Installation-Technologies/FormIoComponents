
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
    this._boundShowHandler = null;  
  }

  attach(element) {
    const result = super.attach(element);

    // Use Static CSS for Error Icons
    // Instead of a MutationObserver watching for class changes, we inject a CSS rule.
    // This is significantly more performant as the browser handles the styling natively.
    if (!document.getElementById('customSelectStyles')) {
      const style = document.createElement('style');
      style.id = 'customSelectStyles';
      style.textContent = `
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
          will-change: transform, opacity;
        }
      `;
      document.head.appendChild(style);
    }

    //  Replace MutationObserver with Choices.js Events
    // Choices.js (the engine Form.io uses) emits events when the dropdown opens.
    const choicesInstance = this.choices || this._choices;

    if (choicesInstance && choicesInstance.passedElement) {
      this._boundShowHandler = this.adjustDropdownPosition.bind(this);
      const el = choicesInstance.passedElement.element;
      // We listen specifically for the 'showDropdown' event
      //  throttle dropdown adjustment using requestAnimationFrame to reduce CPU usage
      

      el.addEventListener("showDropdown", this._boundShowHandler);
      el.addEventListener('hideDropdown', (e) => {
        const dropdown = e.target.closest('.choices').querySelector('.choices__list--dropdown');
        if (dropdown) dropdown.dataset.adjusted = "false";
      });
    }

    return result;
  }
/**
   * OPTIMIZED: Handles collision detection for mobile screens.
   * Ensures the dropdown doesn't get cut off by the bottom of the viewport.
   */
adjustDropdownPosition(event) {
  const element = event.target;
  const dropdown = element.closest('.choices').querySelector('.choices__list--dropdown');
  
  if (!dropdown) return;

  // PERFORMANCE: If we already adjusted this specific dropdown open, skip recalculation
  if (dropdown.dataset.adjusted === "true") return;
  dropdown.dataset.adjusted = "true";

  const rect = element.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 10; // 10px buffer
  const spaceAbove = rect.top - 10;

  // Logic: If less than 200px below and more space above, flip it UP
  if (spaceBelow < 200 && spaceAbove > spaceBelow) {
    dropdown.style.bottom = `${rect.height}px`; 
    dropdown.style.top = 'auto';
    dropdown.style.maxHeight = `${Math.min(spaceAbove, 400)}px`;
  } else {
    dropdown.style.bottom = 'auto';
    dropdown.style.top = '100%';
    dropdown.style.maxHeight = `${Math.min(spaceBelow, 400)}px`;
  }
  
  dropdown.style.overflowY = 'auto';
}

  adjustDropdownLogic(element, choicesInstance) {
    const dropdown = choicesInstance.containerOuter.element.querySelector(
      '.choices__list--dropdown'
    );
    
    if (!dropdown) return;

    // Apply your dynamic height and positioning logic
    dropdown.style.width = `${element.offsetWidth}px`;

    if (dropdown.dataset.adjusted === "true") return;
    dropdown.dataset.adjusted = "true";

    const elementWidth = element.offsetWidth;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

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
    const choicesInstance = this.choices || this._choices;

    //  remove event listener on detach (prevents battery-draining leaks)
    if (
      this._boundShowHandler &&
      choicesInstance &&
      choicesInstance.passedElement
    ) {
      choicesInstance.passedElement.element.removeEventListener(
        "showDropdown",
        this._boundShowHandler
      );
    }

    return super.detach();
  }
}

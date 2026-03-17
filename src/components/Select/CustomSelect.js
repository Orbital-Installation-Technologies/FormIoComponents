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
          top: 100% !important;
          left: 0 !important;
          width: 100% !important;
          z-index: 10000 !important;
        }
        .choices.choices-dropdown-unclip .choices__list--dropdown {
          position: fixed !important;
          left: var(--choices-dropdown-left) !important;
          top: var(--choices-dropdown-top) !important;
          bottom: var(--choices-dropdown-bottom) !important;
          width: var(--choices-dropdown-width) !important;
          max-height: var(--choices-dropdown-max-height) !important;
          z-index: 10001 !important;
        }
      `;
      document.head.appendChild(style);
    }

    //  Replace MutationObserver with Choices.js Events
    // Choices.js (the engine Form.io uses) emits events when the dropdown opens.
    const choicesInstance = this.choices || this._choices;

    if (choicesInstance && choicesInstance.passedElement) {
      const container = choicesInstance.containerOuter.element;
      const passedEl = choicesInstance.passedElement.element;
      passedEl.addEventListener('showDropdown', () => {
        this._applyDropdownUnclip(container);
      });
      passedEl.addEventListener('hideDropdown', () => {
        this._clearDropdownUnclip(container);
      });
    }

    return result;
  }

  _applyDropdownUnclip(container) {
    const rect = container.getBoundingClientRect();
    const margin = 10;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let maxHeight = 400;
    if (window.innerHeight < 400) {
      maxHeight = Math.min(spaceBelow, 200);
    }
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    if (openUp) {
      maxHeight = Math.min(spaceAbove, maxHeight);
    }

    container.classList.add('choices-dropdown-unclip');
    container.style.setProperty('--choices-dropdown-left', `${rect.left}px`);
    container.style.setProperty('--choices-dropdown-width', `${rect.width}px`);
    container.style.setProperty('--choices-dropdown-max-height', `${maxHeight}px`);
    container.style.setProperty('--choices-dropdown-top', openUp ? 'auto' : `${rect.bottom}px`);
    container.style.setProperty('--choices-dropdown-bottom', openUp ? `${window.innerHeight - rect.top}px` : 'auto');
  }

  _clearDropdownUnclip(container) {
    container.classList.remove('choices-dropdown-unclip');
    container.style.removeProperty('--choices-dropdown-left');
    container.style.removeProperty('--choices-dropdown-width');
    container.style.removeProperty('--choices-dropdown-max-height');
    container.style.removeProperty('--choices-dropdown-top');
    container.style.removeProperty('--choices-dropdown-bottom');
  }

  detach() {

    return super.detach();
  }
}

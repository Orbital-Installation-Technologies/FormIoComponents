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
          top: 100%;
          bottom: auto;
          left: 0 !important;
          width: 100% !important;
          z-index: 10000 !important;
        }
        .choices__list--dropdown.is-open-upward {
          top: auto !important;
          bottom: 100% !important;
        }

        /* Wrap long option text — applied when wrapOptionText is enabled */
        .choices--wrap-text .choices__list--dropdown .choices__item,
        .choices--wrap-text .choices__list[aria-expanded] .choices__item {
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
        }
        .choices--wrap-text .choices__inner {
          overflow: visible !important;
          height: auto !important;
          min-height: 44px;
        }
        .choices--wrap-text .choices__list--single .choices__item {
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Apply wrap class based on component setting
    const choicesContainer = element.querySelector('.choices');
    if (choicesContainer) {
      choicesContainer.classList.toggle('choices--wrap-text', this.component.wrapOptionText !== false);
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


  adjustDropdownLogic(element, choicesInstance, isRetry = false) {
    const dropdown = choicesInstance.containerOuter.element.querySelector(
      '.choices__list--dropdown'
    );

    if (!dropdown) return;

    dropdown.style.width = `${element.offsetWidth}px`;

    const rect = choicesInstance.containerOuter.element.getBoundingClientRect();
    const margin = 10;
    const minRequired = 200;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    // Neither direction has enough room — scroll the input into view and retry once
    if (!isRetry && spaceBelow < minRequired && spaceAbove < minRequired) {
      choicesInstance.containerOuter.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this.adjustDropdownLogic(element, choicesInstance, true), 350);
      return;
    }

    const openUpward = spaceBelow < minRequired && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(availableSpace, window.innerHeight < 400 ? 200 : 400);

    dropdown.classList.toggle('is-open-upward', openUpward);

    // Target the inner scrollable list so the dropdown container doesn't add a second scrollbar
    const innerList = dropdown.querySelector('.choices__list');
    if (innerList) {
      innerList.style.maxHeight = `${maxHeight}px`;
      innerList.style.overflowY = 'auto';
    }
  }

  detach() {

    return super.detach();
  }
}

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

        /*
          Do NOT force position/top/left/width here.
          Choices.js sometimes moves the dropdown to <body> for portal/modal escape,
          in which case top:100% resolves against the body and lands at the bottom of
          the page. All positioning is handled in JS using fixed + viewport coords.
        */
        .choices__list--dropdown {
          z-index: 10000 !important;
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

    // DEBUG: fixed banner to confirm this build is active — always visible
    if (!document.getElementById('custom-select-debug-banner')) {
      const debugBanner = document.createElement('div');
      debugBanner.id = 'custom-select-debug-banner';
      debugBanner.textContent = '🛠 CustomSelect PR build active';
      debugBanner.style.cssText = [
        'position:fixed',
        'bottom:0',
        'left:0',
        'right:0',
        'z-index:99999',
        'background:red',
        'color:white',
        'font-weight:bold',
        'font-size:14px',
        'text-align:center',
        'padding:6px',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(debugBanner);
    }

    // Apply wrap class based on component setting
    const choicesContainer = element.querySelector('.choices');
    if (choicesContainer) {
      choicesContainer.classList.toggle('choices--wrap-text', this.component.wrapOptionText !== false);
    }

    const choicesInstance = this.choices || this._choices;

    if (choicesInstance && choicesInstance.passedElement) {
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

    const inputEl = choicesInstance.containerOuter.element;
    const rect = inputEl.getBoundingClientRect();
    const margin = 10;
    const minRequired = 200;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    // Neither direction has enough room — scroll the input into view and retry once
    if (!isRetry && spaceBelow < minRequired && spaceAbove < minRequired) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this.adjustDropdownLogic(element, choicesInstance, true), 350);
      return;
    }

    const openUpward = spaceBelow < minRequired && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const naturalMax = window.innerHeight < 400 ? 200 : 300;

    // Use position:fixed + viewport pixel coords so the dropdown renders correctly
    // regardless of where Choices.js placed it in the DOM (inline, body portal, modal, etc.)
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;

    if (openUpward) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = `${window.innerHeight - rect.top}px`;
    } else {
      dropdown.style.top = `${rect.bottom}px`;
      dropdown.style.bottom = 'auto';
    }

    // Only constrain the inner list's height when space is genuinely tight;
    // otherwise clear inline styles so Choices.js defaults take over.
    const innerList = dropdown.querySelector('.choices__list');
    if (innerList) {
      if (availableSpace < naturalMax) {
        innerList.style.maxHeight = `${Math.min(availableSpace, naturalMax)}px`;
        innerList.style.overflowY = 'auto';
      } else {
        innerList.style.maxHeight = '';
        innerList.style.overflowY = '';
      }
    }
  }

  detach() {
    return super.detach();
  }
}

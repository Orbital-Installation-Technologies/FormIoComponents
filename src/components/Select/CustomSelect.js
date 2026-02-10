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

  hasDataValue() {
    if (Array.isArray(this.dataValue)) {
      return this.dataValue.length > 0;
    }
    if (this.dataValue && typeof this.dataValue === 'object') {
      return Object.keys(this.dataValue).length > 0;
    }
    return this.dataValue !== null && this.dataValue !== undefined && this.dataValue !== '';
  }

  clearStaleDropdownSelection(dropdown) {
    if (this.hasDataValue()) {
      return;
    }

    const staleSelectedChoices = dropdown.querySelectorAll(
      '.choices__item--choice.is-selected'
    );

    if (!staleSelectedChoices.length) {
      return;
    }

    staleSelectedChoices.forEach((choice) => {
      choice.classList.remove('is-selected', 'is-highlighted');
      choice.setAttribute('aria-selected', 'false');
    });
  }
  attach(element) {
    const result = super.attach(element);

    // Store observer for cleanup
    this.errorIconObserver?.disconnect();
    this.dropdownObserver?.disconnect();
    // Function to adjust the error icon
    const adjustErrorIcon = () => {
      const parentNode = element?.parentNode;
      if (!parentNode) return;
      // Look for the error icon inside the parent of the element
      const errorIcon = parentNode.querySelector(
        '.form-control.ui.fluid.selection.dropdown.is-invalid'
      );

      if (errorIcon) {
        errorIcon.style.backgroundPosition = 'calc(100% - 1.5rem) calc(50% - 0.5px)';
      }
    };
    adjustErrorIcon();
    const parentNode = element?.parentNode;
    if (parentNode) {
      this.errorIconObserver = new MutationObserver(() => adjustErrorIcon());
      this.errorIconObserver.observe(parentNode, { childList: true, subtree: true });
    }

    // DYNAMIC DROPDOWN HEIGHT BASED ON SCREEN
    const choicesInstance = this.choices || this._choices;

    if (choicesInstance && parentNode) {
      const observer = new MutationObserver(() => {
        const currentParent = element?.parentNode;
        if (!currentParent) {
          observer.disconnect();
          return;
        }
        const dropdown = currentParent.querySelector(
          '.choices__list.choices__list--dropdown.is-active'
        );
        console.log('Dropdown', dropdown);
        if (!dropdown) return;

        // Make dropdown overlay content
        dropdown.style.position = 'absolute';
        dropdown.style.zIndex = 9999;
        dropdown.style.width = `${element.offsetWidth}px`;
        const rect = element.getBoundingClientRect();
        const margin = 10;
        const rawSpaceBelow = window.innerHeight - rect.bottom - margin;
        const rawSpaceAbove = rect.top - margin;

        // Never allow negative space values
        const spaceBelow = Math.max(rawSpaceBelow, 0);
        const spaceAbove = Math.max(rawSpaceAbove, 0);

        let maxHeight = 400;
        const smallScreenThreshold = 400;

        if (window.innerHeight < smallScreenThreshold) {
          maxHeight = Math.min(spaceBelow, 200);
        }

        // Decide open direction
        if (spaceBelow < 200 && spaceAbove > spaceBelow) {
          maxHeight = Math.min(spaceAbove, maxHeight);
          dropdown.style.bottom = `${rect.height}px`;
        } else {
          dropdown.style.bottom = 'auto';
        }

        // Enforce a reasonable minimum height so the menu is usable
        maxHeight = Math.max(maxHeight, 150);

        dropdown.style.top = 'auto';
        dropdown.style.maxHeight = `${maxHeight}px`;
        dropdown.style.overflowY = 'auto';
        this.clearStaleDropdownSelection(dropdown);
      });

      observer.observe(parentNode, { childList: true, subtree: true });
      this.dropdownObserver = observer;
    }

    return result;
  }
  detach() {
    this.errorIconObserver?.disconnect();
    this.errorIconObserver = null;
    this.dropdownObserver?.disconnect();
    this.dropdownObserver = null;
    return super.detach();
  }
}

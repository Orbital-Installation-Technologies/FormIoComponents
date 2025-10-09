/**
 * DataGrid validation helpers for ReviewButton component
 * Contains logic specific to DataGrid row validation and highlighting
 */

import { hasActualFileData, clearFieldErrors, isFieldNowValid } from './validationUtils.js';
import { addErrorHighlight, removeErrorHighlight, applyFieldErrors } from './uiRenderingHelpers.js';

/**
 * Sets up change listeners on all components in a panel for real-time error clearing
 * @param {Object} panel - Panel component to setup listeners on
 * @param {Object} reviewButtonInstance - Reference to the ReviewButton instance
 */
export function setupChangeListeners(panel, reviewButtonInstance) {
  if (!panel) return;

  panel.everyComponent(function(comp) {
    if (!comp || !comp.component) return;

    var compKey = comp.component.key;

    // Skip if this specific component already has a listener
    if (comp._hasValidationListener) return;
    comp._hasValidationListener = true;

    var compType = comp.type || comp.component.type;

    /**
     * Function to check and clear errors when field value changes
     * @param {*} value - New value of the field
     */
    var checkAndClearError = function(value) {
      setTimeout(function() {
        if (!comp || !panel._errorMap) return;

        // Get value from multiple sources
        var checkValue = value;
        if (!checkValue || checkValue === '') {
          checkValue = comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null);
        }

        var isValid = isFieldNowValid(comp, checkValue);

        if (isValid && panel._errorMap[compKey]) {
          // Field is now valid, remove from error map
          delete panel._errorMap[compKey];
          clearFieldErrors(comp);

          // Check if there are any remaining errors
          var remainingErrors = Object.keys(panel._errorMap || {}).length;

          // If no more errors in this panel, remove panel highlighting
          if (remainingErrors === 0) {
            panel._hasErrors = false;
            panel._customErrors = [];
            panel._errorMap = {};

            // Clear all component errors
            panel.everyComponent?.(function(c) {
              if (c) {
                c.error = '';
                // Use setCustomValidity to safely clear errors
                if (c.setCustomValidity) {
                  c.setCustomValidity([], false);
                }
              }
            });

            if (panel.element) {
              removeErrorHighlight(panel.element);
            }
          }
        }
      }, 50);
    };

    // Add change listener (works for all field types)
    comp.on('change', checkAndClearError);

    // FILE FIELDS: Add upload completion listener
    if (compType === 'file') {
      comp.on('fileUploadingEnd', function() {
        setTimeout(function() {
          checkAndClearError(comp.getValue?.() || comp.dataValue);
        }, 200);
      });
    }

    // TEXT FIELDS (including barcode): Add input listener for immediate feedback
    if (compType === 'textfield' || compType === 'textarea' || compType === 'number' || compType === 'email' || compType === 'phoneNumber' || compType === 'barcode') {
      comp.on('input', checkAndClearError);

      // Setup DOM listeners after a delay to ensure element is rendered
      setTimeout(function() {
        if (!comp.element) return;

        var inputElement = comp.element.querySelector('input, textarea');
        if (inputElement && !inputElement._hasCustomListener) {
          inputElement._hasCustomListener = true;
          inputElement.addEventListener('input', function() {
            checkAndClearError(this.value);
          });
          inputElement.addEventListener('blur', function() {
            checkAndClearError(this.value);
          });
        }
      }, 300);
    }

    // RADIO/CHECKBOX FIELDS: Add DOM-level listeners
    if (compType === 'radio' || compType === 'selectboxes') {
      comp.on('blur', function() {
        checkAndClearError(comp.dataValue || comp.getValue?.());
      });

      // Setup DOM listeners for radio buttons and checkboxes
      setTimeout(function() {
        if (!comp.element) return;

        var radioInputs = comp.element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        radioInputs.forEach(function(radioInput) {
          if (!radioInput._hasCustomListener) {
            radioInput._hasCustomListener = true;
            radioInput.addEventListener('change', function() {
              // For radio buttons, trigger immediately
              setTimeout(function() {
                checkAndClearError(comp.getValue?.() || comp.dataValue);
              }, 50);
            });
            radioInput.addEventListener('click', function() {
              // Also on click for immediate feedback
              setTimeout(function() {
                checkAndClearError(comp.getValue?.() || comp.dataValue);
              }, 100);
            });
          }
        });
      }, 300);
    }

    // SELECT/DROPDOWN FIELDS: Add multiple event listeners for reliability
    if (compType === 'select') {
      comp.on('blur', function() {
        checkAndClearError(comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null));
      });

      // Immediate check on componentChange event
      comp.on('componentChange', function() {
        setTimeout(function() {
          checkAndClearError(comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null));
        }, 100);
      });

      // Setup DOM listeners after a delay to ensure element is rendered
      setTimeout(function() {
        if (!comp.element) return;

        // For native <select> elements
        var selectElement = comp.element.querySelector('select');
        if (selectElement && !selectElement._hasCustomListener) {
          selectElement._hasCustomListener = true;
          selectElement.addEventListener('change', function() {
            checkAndClearError(this.value);
          });
          selectElement.addEventListener('input', function() {
            checkAndClearError(this.value);
          });
        }

        // For Choices.js dropdowns
        var choicesElement = comp.element.querySelector('.choices__inner');
        if (choicesElement && !choicesElement._hasCustomListener) {
          choicesElement._hasCustomListener = true;

          // Listen for clicks on the choices dropdown
          choicesElement.addEventListener('click', function() {
            setTimeout(function() {
              checkAndClearError(comp.dataValue || comp.getValue?.());
            }, 200);
          });

          // Listen for the Choices.js change event on the parent
          var choicesWrapper = comp.element.querySelector('.choices');
          if (choicesWrapper) {
            choicesWrapper.addEventListener('change', function() {
              setTimeout(function() {
                checkAndClearError(comp.dataValue || comp.getValue?.());
              }, 100);
            });
          }
        }
      }, 300);
    }
  });
}

/**
 * Sets up hooks for a single panel to maintain error states during redraws/reattaches
 * @param {Object} panel - Panel component to setup hooks on
 * @param {number} rowIndex - Index of the row in the DataGrid
 * @param {Object} reviewButtonInstance - Reference to the ReviewButton instance
 */
export function setupPanelHooks(panel, rowIndex, reviewButtonInstance) {
  if (panel._errorHooksAdded) return; // Avoid duplicate hooks
  panel._errorHooksAdded = true;

  // Setup change listeners for dynamic error clearing
  setupChangeListeners(panel, reviewButtonInstance);

  // Hook into panel attach method
  var originalPanelAttach = panel.attach;
  panel.attach = function(element) {
    var result = originalPanelAttach.call(this, element);

    // Reapply errors after attach if panel has errors
    if (this._hasErrors) {
      setTimeout(function() {
        applyFieldErrors(panel);
        if (panel.element) {
          addErrorHighlight(panel.element);
        }
      }, 150);
    }

    return result;
  };

  // Hook into panel redraw method
  var originalPanelRedraw = panel.redraw;
  panel.redraw = function() {
    var res = originalPanelRedraw ? originalPanelRedraw.apply(this, arguments) : null;

    // Reapply errors after redraw if panel has errors
    if (this._hasErrors) {
      setTimeout(function() {
        applyFieldErrors(panel);
        if (panel.element) {
          addErrorHighlight(panel.element);
        }
      }, 100);
    }

    return res;
  };
}

/**
 * Highlights DataGrid rows with validation errors
 * @param {Object} dataGrid - DataGrid component
 * @param {Object} results - Validation results
 * @param {Object} reviewButtonInstance - Reference to the ReviewButton instance
 */
export function highlightDataGridRows(dataGrid, results, reviewButtonInstance) {
  if (!dataGrid.rows || !Array.isArray(dataGrid.rows)) return;

  dataGrid.rows.forEach((row, rowIndex) => {
    const panelComponent = row.panel;
    if (!panelComponent) return;

    var rowErrors = [];
    var rowFileTweaks = [];

    // Temporarily disable required validation on file fields with files
    const self = reviewButtonInstance;
    panelComponent.everyComponent?.(function(component) {
      if (!component || !component.visible) return;

      const type = component.type || component.component?.type;
      if (type !== 'file') return;

      const isRequired = !!(component.component?.validate?.required || component.validate?.required);
      if (!isRequired) return;

      // Check if file field has files
      const dataValue = component.dataValue;
      const getVal = component.getValue && component.getValue();
      const files = component.files;
      const serviceFiles = component.fileService?.files;

      let hasValue = false;

      // Check all possible sources
      if (hasActualFileData(dataValue)) hasValue = true;
      if (!hasValue && hasActualFileData(getVal)) hasValue = true;
      if (!hasValue && hasActualFileData(files)) hasValue = true;
      if (!hasValue && hasActualFileData(serviceFiles)) hasValue = true;

      // Check DOM inputs as last resort
      if (!hasValue && component.element) {
        var fileInputs = component.element.querySelectorAll('input[type="file"]');
        fileInputs.forEach?.(function(inp) {
          if (inp?.files && inp.files.length > 0) hasValue = true;
        });
      }

      if (hasValue) {
        var ptr = component.component?.validate ? component.component.validate
          : component.validate ? component.validate
            : (component.component ? (component.component.validate = {}) : (component.validate = {}));
        if (ptr) {
          ptr.required = false;
          rowFileTweaks.push({ component: component, ptr: ptr });
        }
      }
    });

    // Clear existing errors before validation
    panelComponent.everyComponent?.(function(c) {
      if (!c.visible) return;
      c.error = '';
      // Use setCustomValidity to safely clear errors instead of directly setting errors property
      if (c.setCustomValidity) {
        c.setCustomValidity([], false);
      }
    });

    // Run validation on all visible components
    panelComponent.everyComponent?.(function(c) {
      if (!c.visible) return;
      c.checkValidity?.(c.data, false, c.data);
      if (c.errors && c.errors.length > 0) {
        c.errors.forEach(function(err) {
          rowErrors.push({
            rowIndex: rowIndex,
            field: err.component?.label || err.component?.key || 'Field',
            message: err.message,
            error: err
          });
        });
      }
    });

    // Restore file field requirements
    rowFileTweaks.forEach(function(t) {
      if (t.ptr) t.ptr.required = true;
    });

    // Update panel state based on validation results
    if (rowErrors.length > 0) {
      // Store errors in custom property instead of read-only errors property
      panelComponent._customErrors = rowErrors.map(function(e) { return e.error; });
      panelComponent._hasErrors = true;

      // Create error map for quick lookup
      panelComponent._errorMap = {};
      rowErrors.forEach(function(err) {
        if (err.error && err.error.component && err.error.component.key) {
          panelComponent._errorMap[err.error.component.key] = err.error;
        }
      });

    } else {
      // IMPORTANT: Explicitly clear all error states for valid rows
      panelComponent._customErrors = [];
      panelComponent._hasErrors = false;
      panelComponent._errorMap = {};

      // Clear all component errors
      panelComponent.everyComponent?.(function(c) {
        if (c) {
          c.error = '';
          // Use setCustomValidity to safely clear errors
          if (c.setCustomValidity) {
            c.setCustomValidity([], false);
          }
        }
      });

      // Ensure highlighting is removed when no errors
      if (panelComponent.element) {
        removeErrorHighlight(panelComponent.element);
      }
    }

    // Setup hooks for this panel (for maintaining errors during redraws)
    setupPanelHooks(panelComponent, rowIndex, reviewButtonInstance);
  });

  // Apply highlighting after validation
  dataGrid.rows.forEach((row, rowIndex) => {
    const panelComponent = row.panel;
    if (!panelComponent) return;

    // Only highlight if there are actual errors in the error map
    if (panelComponent._hasErrors && panelComponent._errorMap && Object.keys(panelComponent._errorMap).length > 0) {
      setTimeout(() => {
        if (panelComponent.element) {
          addErrorHighlight(panelComponent.element);
        }
      }, 50);
    } else {
      // Make absolutely sure no error highlighting remains on valid rows
      panelComponent._hasErrors = false;
      panelComponent._errorMap = {};
      if (panelComponent.element) {
        removeErrorHighlight(panelComponent.element);
      }
    }
  });
}

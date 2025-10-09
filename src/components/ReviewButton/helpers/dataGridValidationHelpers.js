/**
 * DataGrid validation helpers for ReviewButton component
 * Contains logic specific to DataGrid row validation and highlighting
 */

import { hasActualFileData, clearFieldErrors, isFieldNowValid } from './validationUtils.js';
import { removeErrorHighlight, applyFieldErrors, addErrorHighlight } from './uiRenderingHelpers.js';

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
      console.log('Panel attach - reapplying errors for panel with error map:', panel._errorMap);
      setTimeout(function() {
        applyFieldErrors(panel);
        if (panel.element) addErrorHighlight(panel.element);
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
      console.log('Panel redraw - reapplying errors for panel with error map:', panel._errorMap);
      setTimeout(function() {
        applyFieldErrors(panel);
        if (panel.element) addErrorHighlight(panel.element);
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

  const dataGridKey = dataGrid.key || dataGrid.component?.key;
  if (!dataGridKey) return;

  dataGrid.rows.forEach((row, rowIndex) => {
    const panelComponent = row.panel;
    if (!panelComponent) return;

    // Clear existing errors first
    panelComponent._customErrors = [];
    panelComponent._hasErrors = false;
    panelComponent._errorMap = {};

    // Clear all component errors
    panelComponent.everyComponent?.(function(c) {
      if (c) {
        c.error = '';
        if (c.setCustomValidity) {
          c.setCustomValidity([], false);
        }
      }
    });

    // Check if this row has any errors in the filtered results
    const rowErrors = [];
    const rowPath = `${dataGridKey}[${rowIndex}]`;

    // Look for errors that match this specific row
    if (results && results.errors) {
      Object.keys(results.errors).forEach(path => {
        if (path.startsWith(rowPath + '.')) {
          const error = results.errors[path];
          if (error && error.errors && error.errors.length > 0) {
            // Create error object with component information
            const fieldKey = path.split('.').pop();
            const errorObj = {
              component: { key: fieldKey },
              message: error.errors[0] || 'Invalid',
              errors: error.errors
            };
            rowErrors.push(errorObj);
          }
        }
      });
    }

    // If this row has errors, set up the error state
    if (rowErrors.length > 0) {
      panelComponent._customErrors = rowErrors;
      panelComponent._hasErrors = true;

      // Create error map for quick lookup
      panelComponent._errorMap = {};
      rowErrors.forEach(function(err) {
        if (err && err.component && err.component.key) {
          panelComponent._errorMap[err.component.key] = err;
          console.log(`Added to error map: ${err.component.key}`, err);
        }
      });
      console.log('Final error map for row', rowIndex, ':', panelComponent._errorMap);
    }

    // Setup hooks for this panel (for maintaining errors during redraws)
    setupPanelHooks(panelComponent, rowIndex, reviewButtonInstance);
  });

  // Apply highlighting after setting up error states
  dataGrid.rows.forEach((row, rowIndex) => {
    const panelComponent = row.panel;
    if (!panelComponent) return;

    // Only highlight if there are actual errors in the error map
    if (panelComponent._hasErrors && panelComponent._errorMap && Object.keys(panelComponent._errorMap).length > 0) {
      setTimeout(function () { 
        if (panelComponent.element) addErrorHighlight(panelComponent.element); 
      }, 50);
    } else {
      panelComponent._hasErrors = false;
      panelComponent._errorMap = {};
      if (panelComponent.element) removeErrorHighlight(panelComponent.element);
    }
  });
}

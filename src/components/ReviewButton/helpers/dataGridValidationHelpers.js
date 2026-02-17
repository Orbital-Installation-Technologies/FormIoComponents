/**
 * DataGrid validation helpers for ReviewButton component
 * Contains logic specific to DataGrid row validation and highlighting
 */

import { hasActualFileData, clearFieldErrors, isFieldNowValid } from './validationUtils.js';
import { addErrorHighlight, removeErrorHighlight, applyFieldErrors } from './uiRenderingHelpers.js';

// Battery optimization: Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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

    if (comp._hasValidationListener) return;
    comp._hasValidationListener = true;

    var compType = comp.type || comp.component.type;

    /**
     * Function to check and clear errors when field value changes
     * Battery optimization: Use requestAnimationFrame and debouncing
     * @param {*} value - New value of the field
     */
    var checkAndClearErrorCore = function(value) {
      if (!comp || !panel._errorMap) return;

      var checkValue = value;
      if (!checkValue || checkValue === '') {
        checkValue = comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null);
      }

      var isValid = isFieldNowValid(comp, checkValue);

      if (isValid && panel._errorMap[compKey]) {
        delete panel._errorMap[compKey];
        clearFieldErrors(comp);

        // Battery optimization: Count errors more efficiently
        let remainingErrors = 0;
        for (const key in panel._errorMap) {
          if (panel._errorMap.hasOwnProperty(key)) {
            remainingErrors++;
          }
        }

        if (remainingErrors === 0) {
          panel._hasErrors = false;
          panel._customErrors = [];
          panel._errorMap = {};

          // Battery optimization: Use requestAnimationFrame for DOM updates
          requestAnimationFrame(function() {
            panel.everyComponent?.(function(c) {
              if (c) {
                c.error = '';
                if (c.setCustomValidity) {
                  c.setCustomValidity([], false);
                }
              }
            });

            if (panel.element) {
              removeErrorHighlight(panel.element);
            }
          });
        }
      }
    };
    
    // Battery optimization: Debounce error checking to reduce CPU usage
    var checkAndClearError = debounce(checkAndClearErrorCore, 150);

    comp.on('change', checkAndClearError);

    if (compType === 'file') {
      comp.on('fileUploadingEnd', function() {
        // Battery optimization: Use requestAnimationFrame instead of setTimeout
        requestAnimationFrame(function() {
          checkAndClearError(comp.getValue?.() || comp.dataValue);
        });
      });
    }

    if (compType === 'textfield' || compType === 'textarea' || compType === 'number' || compType === 'email' || compType === 'phoneNumber' || compType === 'barcode') {
      comp.on('input', checkAndClearError);

      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(function() {
        if (!comp.element) return;

        var inputElement = comp.element.querySelector('input, textarea');
        if (inputElement && !inputElement._hasCustomListener) {
          inputElement._hasCustomListener = true;
          // Battery optimization: Use passive listeners where possible
          inputElement.addEventListener('input', function() {
            checkAndClearError(this.value);
          }, { passive: true });
          inputElement.addEventListener('blur', function() {
            checkAndClearError(this.value);
          });
        }
      });
    }

    if (compType === 'radio' || compType === 'selectboxes') {
      comp.on('blur', function() {
        checkAndClearError(comp.dataValue || comp.getValue?.());
      });

      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(function() {
        if (!comp.element) return;

        var radioInputs = comp.element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        // Battery optimization: Use for loop instead of forEach
        for (let i = 0; i < radioInputs.length; i++) {
          const radioInput = radioInputs[i];
          if (!radioInput._hasCustomListener) {
            radioInput._hasCustomListener = true;
            radioInput.addEventListener('change', function() {
              // Battery optimization: Use requestAnimationFrame instead of setTimeout
              requestAnimationFrame(function() {
                checkAndClearError(comp.getValue?.() || comp.dataValue);
              });
            }, { passive: true });
            radioInput.addEventListener('click', function() {
              // Battery optimization: Use requestAnimationFrame instead of setTimeout
              requestAnimationFrame(function() {
                checkAndClearError(comp.getValue?.() || comp.dataValue);
              });
            }, { passive: true });
          }
        }
      });
    }

    if (compType === 'select') {
      comp.on('blur', function() {
        checkAndClearError(comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null));
      });

      comp.on('componentChange', function() {
        // Battery optimization: Use requestAnimationFrame instead of setTimeout
        requestAnimationFrame(function() {
          checkAndClearError(comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null));
        });
      });

      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(function() {
        if (!comp.element) return;

        var selectElement = comp.element.querySelector('select');
        if (selectElement && !selectElement._hasCustomListener) {
          selectElement._hasCustomListener = true;
          selectElement.addEventListener('change', function() {
            checkAndClearError(this.value);
          }, { passive: true });
          selectElement.addEventListener('input', function() {
            checkAndClearError(this.value);
          }, { passive: true });
        }

        var choicesElement = comp.element.querySelector('.choices__inner');
        if (choicesElement && !choicesElement._hasCustomListener) {
          choicesElement._hasCustomListener = true;

          choicesElement.addEventListener('click', function() {
            // Battery optimization: Use requestAnimationFrame instead of setTimeout
            requestAnimationFrame(function() {
              checkAndClearError(comp.dataValue || comp.getValue?.());
            });
          }, { passive: true });

          var choicesWrapper = comp.element.querySelector('.choices');
          if (choicesWrapper) {
            choicesWrapper.addEventListener('change', function() {
              // Battery optimization: Use requestAnimationFrame instead of setTimeout
              requestAnimationFrame(function() {
                checkAndClearError(comp.dataValue || comp.getValue?.());
              });
            }, { passive: true });
          }
        }
      });
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
  if (panel._errorHooksAdded) return;
  panel._errorHooksAdded = true;

  setupChangeListeners(panel, reviewButtonInstance);

  var originalPanelAttach = panel.attach;
  panel.attach = function(element) {
    var result = originalPanelAttach.call(this, element);

    if (this._hasErrors) {
      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(function() {
        applyFieldErrors(panel);
        if (panel.element) {
          addErrorHighlight(panel.element);
        }
      });
    }

    return result;
  };

  var originalPanelRedraw = panel.redraw;
  panel.redraw = function() {
    var res = originalPanelRedraw ? originalPanelRedraw.apply(this, arguments) : null;

    if (this._hasErrors) {
      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(function() {
        applyFieldErrors(panel);
        if (panel.element) {
          addErrorHighlight(panel.element);
        }
      });
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

  // Battery optimization: Use for loop instead of forEach
  for (let rowIndex = 0; rowIndex < dataGrid.rows.length; rowIndex++) {
    const row = dataGrid.rows[rowIndex];
    const panelComponent = row.panel;
    if (!panelComponent) return;

    var rowErrors = [];
    var rowFileTweaks = [];

    panelComponent.everyComponent?.(function(component) {
      if (!component || !component.visible) return;

      const type = component.type || component.component?.type;
      if (type !== 'file') return;

      const isRequired = !!(component.component?.validate?.required || component.validate?.required);
      if (!isRequired) return;

      const dataValue = component.dataValue;
      const getVal = component.getValue && component.getValue();
      const files = component.files;
      const serviceFiles = component.fileService?.files;

      let hasValue = false;

      if (hasActualFileData(dataValue)) hasValue = true;
      if (!hasValue && hasActualFileData(getVal)) hasValue = true;
      if (!hasValue && hasActualFileData(files)) hasValue = true;
      if (!hasValue && hasActualFileData(serviceFiles)) hasValue = true;

      if (!hasValue && component.element) {
        var fileInputs = component.element.querySelectorAll('input[type="file"]');
        // Battery optimization: Use for loop instead of forEach
        for (let i = 0; i < fileInputs.length; i++) {
          const inp = fileInputs[i];
          if (inp?.files && inp.files.length > 0) {
            hasValue = true;
            break; // Early exit
          }
        }
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

    panelComponent.everyComponent?.(function(c) {
      if (!c.visible) return;
      c.error = '';
      if (c.setCustomValidity) {
        c.setCustomValidity([], false);
      }
    });

    panelComponent.everyComponent?.(function(c) {
      if (!c.visible) return;
      c.checkValidity?.(c.data, false, c.data);
      if (c.errors && c.errors.length > 0) {
        // Battery optimization: Use for loop instead of forEach
        for (let errIdx = 0; errIdx < c.errors.length; errIdx++) {
          const err = c.errors[errIdx];
          rowErrors.push({
            rowIndex: rowIndex,
            field: err.component?.label || err.component?.key || 'Field',
            message: err.message,
            error: err
          });
        }
      }
    });

    // Battery optimization: Use for loop instead of forEach
    for (let i = 0; i < rowFileTweaks.length; i++) {
      const t = rowFileTweaks[i];
      if (t.ptr) t.ptr.required = true;
    }

    if (rowErrors.length > 0) {
      // Battery optimization: Use for loop instead of map
      panelComponent._customErrors = [];
      for (let i = 0; i < rowErrors.length; i++) {
        panelComponent._customErrors.push(rowErrors[i].error);
      }
      panelComponent._hasErrors = true;

      panelComponent._errorMap = {};
      // Battery optimization: Use for loop instead of forEach
      for (let i = 0; i < rowErrors.length; i++) {
        const err = rowErrors[i];
        if (err.error && err.error.component && err.error.component.key) {
          panelComponent._errorMap[err.error.component.key] = err.error;
        }
      }

    } else {
      panelComponent._customErrors = [];
      panelComponent._hasErrors = false;
      panelComponent._errorMap = {};

      panelComponent.everyComponent?.(function(c) {
        if (c) {
          c.error = '';
          if (c.setCustomValidity) {
            c.setCustomValidity([], false);
          }
        }
      });

      if (panelComponent.element) {
        removeErrorHighlight(panelComponent.element);
      }
    }

    setupPanelHooks(panelComponent, rowIndex, reviewButtonInstance);
  }

  // Battery optimization: Use for loop instead of forEach
  for (let rowIndex = 0; rowIndex < dataGrid.rows.length; rowIndex++) {
    const row = dataGrid.rows[rowIndex];
    const panelComponent = row.panel;
    if (!panelComponent) continue;

    // Battery optimization: Check error map more efficiently
    let hasErrorMapEntries = false;
    if (panelComponent._errorMap) {
      for (const key in panelComponent._errorMap) {
        if (panelComponent._errorMap.hasOwnProperty(key)) {
          hasErrorMapEntries = true;
          break;
        }
      }
    }

    if (panelComponent._hasErrors && hasErrorMapEntries) {
      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(function() {
        if (panelComponent.element) {
          addErrorHighlight(panelComponent.element);
        }
      });
    } else {
      panelComponent._hasErrors = false;
      panelComponent._errorMap = {};
      if (panelComponent.element) {
        removeErrorHighlight(panelComponent.element);
      }
    }
  }
}

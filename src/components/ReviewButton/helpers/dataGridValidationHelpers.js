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

        var checkValue = value;
        if (!checkValue || checkValue === '') {
          checkValue = comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null);
        }

        var isValid = isFieldNowValid(comp, checkValue);

        if (isValid && panel._errorMap[compKey]) {
          delete panel._errorMap[compKey];
          clearFieldErrors(comp);

          var remainingErrors = Object.keys(panel._errorMap || {}).length;

          if (remainingErrors === 0) {
            panel._hasErrors = false;
            panel._customErrors = [];
            panel._errorMap = {};

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
          }
        }
      }, 50);
    };

    comp.on('change', checkAndClearError);

    if (compType === 'file') {
      comp.on('fileUploadingEnd', function() {
        setTimeout(function() {
          checkAndClearError(comp.getValue?.() || comp.dataValue);
        }, 200);
      });
    }

    if (compType === 'textfield' || compType === 'textarea' || compType === 'number' || compType === 'email' || compType === 'phoneNumber' || compType === 'barcode') {
      comp.on('input', checkAndClearError);

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

    if (compType === 'radio' || compType === 'selectboxes') {
      comp.on('blur', function() {
        checkAndClearError(comp.dataValue || comp.getValue?.());
      });

      setTimeout(function() {
        if (!comp.element) return;

        var radioInputs = comp.element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        radioInputs.forEach(function(radioInput) {
          if (!radioInput._hasCustomListener) {
            radioInput._hasCustomListener = true;
            radioInput.addEventListener('change', function() {
              setTimeout(function() {
                checkAndClearError(comp.getValue?.() || comp.dataValue);
              }, 50);
            });
            radioInput.addEventListener('click', function() {
              setTimeout(function() {
                checkAndClearError(comp.getValue?.() || comp.dataValue);
              }, 100);
            });
          }
        });
      }, 300);
    }

    if (compType === 'select') {
      comp.on('blur', function() {
        checkAndClearError(comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null));
      });

      comp.on('componentChange', function() {
        setTimeout(function() {
          checkAndClearError(comp.dataValue || comp.getValue?.() || (comp.data ? comp.data[compKey] : null));
        }, 100);
      });

      setTimeout(function() {
        if (!comp.element) return;

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

        var choicesElement = comp.element.querySelector('.choices__inner');
        if (choicesElement && !choicesElement._hasCustomListener) {
          choicesElement._hasCustomListener = true;

          choicesElement.addEventListener('click', function() {
            setTimeout(function() {
              checkAndClearError(comp.dataValue || comp.getValue?.());
            }, 200);
          });

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
  if (panel._errorHooksAdded) return;
  panel._errorHooksAdded = true;

  setupChangeListeners(panel, reviewButtonInstance);

  var originalPanelAttach = panel.attach;
  panel.attach = function(element) {
    var result = originalPanelAttach.call(this, element);

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

  var originalPanelRedraw = panel.redraw;
  panel.redraw = function() {
    var res = originalPanelRedraw ? originalPanelRedraw.apply(this, arguments) : null;

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

    rowFileTweaks.forEach(function(t) {
      if (t.ptr) t.ptr.required = true;
    });

    if (rowErrors.length > 0) {
      panelComponent._customErrors = rowErrors.map(function(e) { return e.error; });
      panelComponent._hasErrors = true;

      panelComponent._errorMap = {};
      rowErrors.forEach(function(err) {
        if (err.error && err.error.component && err.error.component.key) {
          panelComponent._errorMap[err.error.component.key] = err.error;
        }
      });

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
  });

  dataGrid.rows.forEach((row, rowIndex) => {
    const panelComponent = row.panel;
    if (!panelComponent) return;

    if (panelComponent._hasErrors && panelComponent._errorMap && Object.keys(panelComponent._errorMap).length > 0) {
      setTimeout(() => {
        if (panelComponent.element) {
          addErrorHighlight(panelComponent.element);
        }
      }, 50);
    } else {
      panelComponent._hasErrors = false;
      panelComponent._errorMap = {};
      if (panelComponent.element) {
        removeErrorHighlight(panelComponent.element);
      }
    }
  });
}
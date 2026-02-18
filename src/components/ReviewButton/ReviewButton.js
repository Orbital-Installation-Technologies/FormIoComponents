import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";
import {
  hasActualFileData,
  initializeValidationResults,
  createErrorResults,
  validateSelectedComponents,
  validateComponentsAndCollectResults,
  isFormValid,
  updateFormValues,
  generateErrorSummary,
  findComponentsToValidate,
  clearFieldErrors,
  validateFileComponentWithRelaxedRequired,
  addErrorHighlight,
  removeErrorHighlight,
  ensureErrorHighlightStyles,
  applyFieldErrors,
  setupChangeListeners,
  setupPanelHooks,
  highlightDataGridRows,
  createReviewModal,
  validateModalForm,
  setupScreenshotComponent,
  setupModalEventHandlers,
  updateFormWithModalData,
  collectFormDataForReview,
  updateFormValuesBeforeReview,
  collectReviewLeavesAndLabels,
  renderLeaves,
  scrollToEndOfPage
} from "./helpers/index.js";
// Import these functions directly to avoid bundling issues with re-exports
import {
  initializeExternalValidationResults,
  createExternalErrorResults
} from "./helpers/validationUtils.js";
const FieldComponent = Components.components.field;
const CONTAINER_TYPES = new Set(['panel', 'columns', 'well', 'fieldset', 'datagrid', 'datamap', 'form', 'editgrid', 'table', 'tabs', 'row', 'column', 'content', 'htmlelement']);

export default class ReviewButton extends FieldComponent {
  static editForm = editForm;

  static schema(...extend) {
    return FieldComponent.schema({
      type: "reviewbutton",
      label: "Review and Submit", 
      key: "reviewButton",
      input: false,
    }, ...extend);
  }

  static get builderInfo() {
    return {
      title: "Review Button",
      group: "basic", 
      icon: "eye",
      weight: 10,
      documentation: "",
      schema: ReviewButton.schema(),
    };
  }

  init() {
    super.init();
    // Battery optimization: Store timeout IDs for cleanup
    this._timeoutIds = [];
    // Battery optimization: Cache for DOM queries
    this._domCache = {};
    // Battery optimization: Track redraw operations to throttle
    this._pendingRedraw = false;
    
    this.root.on("submitDone", (submission) => {
      this.handleAfterSubmit(submission);
    });

    if (this.root) {
      this.registerFormValidationMethods();
      this.setupValidationEventHandler();
      this.exposeValidationMethods();
    }
  }

  handleAfterSubmit(submission) {
    const action = this.component.afterSubmitAction || "reload";
    
    switch (action) {
      case "redirect":
        this.handleRedirect();
        break;
      case "customHtml":
        // Battery optimization: Use requestAnimationFrame instead of setTimeout
        const tryHandleCustomHtml = () => {
          if (this.root?.element) {
            this.handleCustomHtml(submission);
          } else {
            console.warn("Root element not ready, retrying...");
            // Battery optimization: Use requestAnimationFrame for DOM readiness checks
            requestAnimationFrame(() => {
              const timeoutId = setTimeout(tryHandleCustomHtml, 200);
              this._timeoutIds.push(timeoutId);
            });
          }
        };
        tryHandleCustomHtml();
        break;
      case "reload":
      default:
        window.location.reload();
        break;
    }
  }

  handleRedirect() {
    const url = this.component.redirectUrl;
    if (!url) {
      console.error("Redirect URL not configured");
      window.location.reload();
      return;
    }
    
    if (!/^https?:\/\/.+/.test(url)) {
      console.error("Invalid redirect URL format. Must start with http:// or https://");
      window.location.reload();
      return;
    }
    
    window.location.href = url;
  }

  handleCustomHtml(submission) {
    const customHtml = this.component.customSuccessHtml;
    if (!customHtml) {
      console.error("Custom HTML not configured");
      window.location.reload();
      return;
    }
    
    const formElement = this.root.element;
    if (!formElement) {
      console.error("Form element not found");
      window.location.reload();
      return;
    }
    
    if (typeof window !== 'undefined') {
      window.formioSubmissionData = submission?.data || this.root?.data || {};
    }
    
    formElement.innerHTML = customHtml;
    
    const scripts = formElement.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  registerFormValidationMethods() {
    this.root.validateFormExternal = async (options) => await this.validateFormExternal(options);
    this.root.isFormValid = async () => await this.isFormValid();
    this.root.validateFields = async (fieldKeys, options) => await this.validateFields(fieldKeys, options);
    this.root.triggerValidation = async (options) => await this.triggerValidation(options);
  }

  setupValidationEventHandler() {
    this.root.on("validateForm", async (callback) => {
      const results = await this.validateFormExternal();
      if (typeof callback === "function") callback(results);
      return results;
    });
  }

  exposeValidationMethods() {
    if (typeof window !== 'undefined') {
      window.formValidation = {
        validate: async (options) => await this.validateFormExternal(options),
        validateFields: async (fields, options) => await this.validateFields(fields, options),
        isValid: async () => await this.isFormValid()
      };
    }
  }

  async validateForm() {
    try {
      let isValid = true;

      const handleAddressValidation = (component) => {
        const addressValue = component.dataValue?.formattedPlace;
        const isEmpty = !addressValue || !addressValue.trim();

        if (isEmpty) {
          const errorMessage = `${component.component?.label || component.key} is required.`;
          if (component.setCustomValidity) {
            component.setCustomValidity([errorMessage], true);
          }

          // Battery optimization: Use requestAnimationFrame for DOM updates
          const timeoutId = setTimeout(() => {
            if (component.setCustomValidity) {
              component.setCustomValidity([errorMessage], true);
            }
            requestAnimationFrame(() => {
              if (component.redraw) component.redraw();
            });
          }, 5000);
          this._timeoutIds.push(timeoutId);

          return false;
        }

        return component.checkValidity();
      };

      const handleFileValidation = (component) => {
        const isRequired = component.component?.validate?.required || component.validate?.required;
        if (!isRequired) return component.checkValidity(component.data, true);

        const dataValue = component.dataValue;
        const componentData = component.data;
        const rootData = this.root?.data;
        const submissionData = this.root?.submission?.data;
        const componentKey = component.key || component.component?.key;

        const hasValue = hasActualFileData(dataValue) || hasActualFileData(componentData) ||
                        (rootData && componentKey && hasActualFileData(rootData[componentKey])) ||
                        (submissionData && componentKey && hasActualFileData(submissionData[componentKey])) ||
                        (component.files && Array.isArray(component.files) && component.files.length > 0);

        return hasValue;
      };

      this.root.everyComponent((component) => {
        if (component.component?.hidden === true || component.hidden === true) return true;
        
        if (component.disabled === true || component.component?.disabled === true) {
          if (component.component?.reviewVisible !== true) return true;
        }
        
        if (!component.visible || component._visible === false) return true;

        if (!component.checkValidity) return true;

        const componentType = component.type || component.component?.type;
        const isAddressComponent = componentType === 'address';
        const isFileComponent = componentType === 'file';

        const valid = isAddressComponent && component.component?.validate?.required
          ? handleAddressValidation(component)
          : isFileComponent
          ? handleFileValidation(component)
          : component.checkValidity(component.data, true);

        if (!valid) {
          isValid = false;
          component.setCustomValidity(component.errors, true);
        }

        return true;
      });

      // Battery optimization: Throttle redraw operations
      this.throttledRedraw();

      if (!isValid) {
        this.scrollToFirstError();
      }

      return isValid;
    } catch (err) {
      return false;
    }
  }

  scrollToFirstError() {
    // Battery optimization: Cache DOM query
    const cacheKey = 'firstError';
    let firstError = this._domCache[cacheKey];
    if (!firstError || !document.contains(firstError)) {
      firstError = this.root.element.querySelector('.formio-error-wrapper, .has-error, .is-invalid');
      this._domCache[cacheKey] = firstError;
    }
    if (firstError) {
      // Battery optimization: Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  markAllComponentsAsDirty() {
    if (this.root?.everyComponent) {
      this.root.everyComponent((c) => {
        try {
          if (typeof c.setPristine === 'function') c.setPristine(false);
          if (typeof c.setDirty === 'function') c.setDirty(true);
        } catch { }
      });
    }
  }

  markDatagridRowsAsDirty() {
    if (this.root?.everyComponent) {
      this.root.everyComponent((c) => {
        try {
          if (c.component?.type === 'datagrid' && c.rows) {
            c.rows.forEach((row) => {
              Object.values(row).forEach((child) => {
                if (child?.setPristine) child.setPristine(false);
                if (child?.setDirty) child.setDirty(true);
              });
            });
          }
        } catch { }
      });
    }
  }

  scrollToFirstErrorAdvanced() {
    // Battery optimization: Cache DOM query
    const cacheKey = 'firstErrorAdvanced';
    let firstError = this._domCache[cacheKey];
    if (!firstError || !document.contains(firstError)) {
      firstError = this.root?.element?.querySelector?.(
        '.formio-error-wrapper, .has-error, .is-invalid, [data-component-error="true"]'
      );
      this._domCache[cacheKey] = firstError;
    }
    if (firstError?.scrollIntoView) {
      // Battery optimization: Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  async validateFields(fieldKeys, options = {}) {
    const keys = Array.isArray(fieldKeys) ? fieldKeys : [fieldKeys];
    const opts = {
      showErrors: true,
      scrollToError: true,
      ...options
    };

    try {
      const results = initializeValidationResults();
      const componentsToValidate = findComponentsToValidate(keys, this.root);
      await validateSelectedComponents(componentsToValidate, results, opts, this);

      if (opts.showErrors) {
        await this.updateUIWithErrors(results, opts.scrollToError);
      }

      return results;
    } catch (err) {
      return createErrorResults();
    }
  }

  async updateUIWithErrors(results, scrollToError) {
    // Battery optimization: Throttle redraw operations
    this.throttledRedraw();

    if (scrollToError && !results.isValid && results.invalidComponents.length > 0) {
      const firstComponent = results.invalidComponents[0].component;
      if (firstComponent.element?.scrollIntoView) {
        // Battery optimization: Use requestAnimationFrame for smooth scrolling
        requestAnimationFrame(() => {
          firstComponent.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }
  }

  async isFormValid() {
    return isFormValid(this.root);
  }

  async validateFormExternal(options = {}) {
    const opts = {
      showErrors: true,
      scrollToError: true,
      includeWarnings: true,
      ...options
    };

    try {
      const results = initializeExternalValidationResults();
      
      this.markAllComponentsAsDirty();
      this.markDatagridRowsAsDirty();

      const errorMap = new Map();
      const warningMap = new Map();

      if (this.root?.everyComponent) {
        await validateComponentsAndCollectResults(this.root, errorMap, warningMap, results, opts);
      }

      results.errors = Object.fromEntries(errorMap);
      results.warnings = Object.fromEntries(warningMap);
      generateErrorSummary(errorMap, results);

      if (opts.showErrors) {
        await this.handleExternalValidationUIUpdates(results, opts);
      }

      return results;
    } catch (err) {
      console.error('Error in validateFormExternal:', err);
      return createExternalErrorResults();
    }
  }

  async handleExternalValidationUIUpdates(results, opts) {
    // Battery optimization: Throttle redraw operations
    this.throttledRedraw();

    if (!results.isValid && typeof this.root?.showErrors === 'function') {
      // Battery optimization: Use requestAnimationFrame for DOM updates
      requestAnimationFrame(() => {
        this.root.showErrors();
      });
    }

    if (opts.scrollToError && !results.isValid) {
      this.scrollToFirstErrorAdvanced();
    } else if (!opts.scrollToError && !results.isValid) {
      // Battery optimization: Use requestAnimationFrame for scrolling
      requestAnimationFrame(() => {
        scrollToEndOfPage();
      });
    }

    if (!results.isValid) {
      this.applyDataGridRowHighlighting(results);
    } else {
      this.clearAllDataGridRowHighlighting();
    }
  }

  applyDataGridRowHighlighting(results) {
    if (!this.root?.everyComponent) return;

    this.root.everyComponent((component) => {
      const componentType = component.type || component.component?.type;
      if (componentType === 'datagrid' || componentType === 'datatable' || componentType === 'editgrid') {
        highlightDataGridRows(component, results);
      }
    });
  }

  highlightDataGridRows(dataGrid, results) {
    highlightDataGridRows(dataGrid, results, this);
  }

  addErrorHighlight(element) {
    addErrorHighlight(element);
  }

  ensureErrorHighlightStyles() {
    ensureErrorHighlightStyles();
  }

  removeErrorHighlight(element) {
    removeErrorHighlight(element);
  }

  clearAllDataGridRowHighlighting() {
    if (!this.root?.everyComponent) return;

    this.root.everyComponent((component) => {
      const componentType = component.type || component.component?.type;
      if (componentType === 'datagrid' || componentType === 'datatable' || componentType === 'editgrid') {
        this.clearDataGridRowHighlighting(component);
      }
    });
  }

  clearDataGridRowHighlighting(dataGrid) {
    if (!dataGrid.rows || !Array.isArray(dataGrid.rows)) return;

    dataGrid.rows.forEach((row) => {
      const panelComponent = row.panel;
      if (panelComponent && panelComponent.element) {
        removeErrorHighlight(panelComponent.element);
        panelComponent._hasErrors = false;
        panelComponent._customErrors = [];
      }
    });
  }

  clearDataGridValidationState() {
    this.root.everyComponent(comp => {
      if (comp.component?.type === 'datagrid' && comp.rows) {
        comp.rows.forEach((row) => {
          if (row.panel) {
            row.panel._hasErrors = false;
            row.panel._errorMap = {};
            row.panel._customErrors = [];
            
            row.panel.everyComponent?.(c => {
              if (c) {
                c.error = '';
                if (c.setCustomValidity) {
                  c.setCustomValidity([], false);
                }
              }
            });
            
            if (row.panel.element) {
              removeErrorHighlight(row.panel.element);
            }
          }
        });
      }
    });
  }

  validateDataGridRows(dataGrid) {
    if (!dataGrid.rows || !Array.isArray(dataGrid.rows)) return;

    dataGrid.rows.forEach((row, rowIndex) => {
      const panelComponent = row.panel;
      if (!panelComponent) return;

      if (panelComponent.everyComponent) {
        panelComponent.everyComponent((comp) => {
          if (comp.component?.hidden === true || comp.hidden === true) return;
          if (comp.disabled === true || comp.component?.disabled === true) {
            if (comp.component?.reviewVisible !== true) return;
          }
          if (!comp.visible || comp._visible === false) return;
          
          if (comp.setCustomValidity) {
            comp.setCustomValidity([], false);
          }
        });
      }

      if (panelComponent.everyComponent) {
        panelComponent.everyComponent((comp) => {
          if (comp.component?.hidden === true || comp.hidden === true) return;
          if (comp.disabled === true || comp.component?.disabled === true) {
            if (comp.component?.reviewVisible !== true) return;
          }
          if (!comp.visible || comp._visible === false) return;
          
          if (comp.checkValidity) {
            try {
              const componentType = comp.type || comp.component?.type;
              if (componentType === 'file') {
                const isValid = validateFileComponentWithRelaxedRequired(comp);
                
                if (!isValid) {
                  if (comp.setCustomValidity) {
                    const errorMessage = `${comp.component?.label || comp.key} is required.`;
                    comp.setCustomValidity([errorMessage], true);
                  }
                } else {
                  if (comp.setCustomValidity) {
                    comp.setCustomValidity([], false);
                  }
                  if (comp.redraw) {
                    comp.redraw();
                  }
                  if (comp.checkValidity) {
                    comp.checkValidity(comp.data, true);
                  }
                }
              } else {
                comp.checkValidity(comp.data, true);
              }
            } catch (err) {
              console.error('validateDataGridRows: Error validating component', comp.key, 'in row', rowIndex, err);
            }
          }
        });
      }
    });
  }

  checkFileComponentHasValue(comp) {
    if (!comp) return false;

    const isMultiple = comp.component?.multiple || comp.multiple;
    const dataValue = comp.dataValue;
    const getValue = comp.getValue && comp.getValue();
    const files = comp.files;
    const serviceFiles = comp.fileService?.files;
    const value = comp.value;
    const rawValue = comp.rawValue;
    const submissionValue = comp.submissionValue;
    const uploads = comp.uploads;
    const fileData = comp.fileData;
    const uploadedFiles = comp.uploadedFiles;
    const fileList = comp.fileList;
    
    const hasValue = hasActualFileData(dataValue) ||
                    hasActualFileData(getValue) ||
                    hasActualFileData(files) ||
                    hasActualFileData(serviceFiles) ||
                    hasActualFileData(value) ||
                    hasActualFileData(rawValue) ||
                    hasActualFileData(submissionValue) ||
                    hasActualFileData(uploads) ||
                    hasActualFileData(fileData) ||
                    hasActualFileData(uploadedFiles) ||
                    hasActualFileData(fileList);
    
    if (!hasValue && comp.element) {
      const fileInputs = comp.element.querySelectorAll('input[type="file"]');
      for (const input of fileInputs) {
        if (input?.files && input.files.length > 0) {
          return true;
        }
        if (input?.hasAttribute('multiple') && input.files && input.files.length > 0) {
          return true;
        }
      }
      
      const uploadedFiles = comp.element.querySelectorAll('.file-row, .uploaded-file, [data-file-id]');
      if (uploadedFiles.length > 0) {
        return true;
      }
      
      const fileLists = comp.element.querySelectorAll('.file-list, .uploaded-files, table tbody tr');
      for (const list of fileLists) {
        if (list.textContent && list.textContent.trim() && 
            !list.textContent.includes('File Name') && 
            !list.textContent.includes('Size') &&
            !list.textContent.includes('Drop files') &&
            !list.textContent.includes('Browse Files')) {
          return true;
        }
      }
      
      if (isMultiple) {
        const tableRows = comp.element.querySelectorAll('table tbody tr, .file-row, .upload-item');
        for (const row of tableRows) {
          const rowText = row.textContent || '';
          const hasFileName = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|avi|mov|webp|svg|bmp|tiff)$/i.test(rowText);
          const hasFileSize = /\d+\.?\d*\s*(kb|mb|gb|bytes?)/i.test(rowText);
          
          if ((hasFileName || hasFileSize) && !rowText.includes('File Name') && !rowText.includes('Size')) {
            return true;
          }
        }
        
        const fileItems = comp.element.querySelectorAll('.file-item, .uploaded-file-item, .file-preview');
        if (fileItems.length > 0) {
          return true;
        }
      }
      
      const allText = comp.element.textContent || '';
      const filenamePattern = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|avi|mov)$/i;
      if (filenamePattern.test(allText)) {
        return true;
      }
      
      const fileElements = comp.element.querySelectorAll('[class*="file"], [class*="upload"], [data-file], [data-upload]');
      if (fileElements.length > 0) {
        return true;
      }
      
      const hasFileContent = allText.trim().length > 0 && 
                            !allText.includes('No file') && 
                            !allText.includes('Choose file') &&
                            !allText.includes('Browse') &&
                            !allText.includes('Select file') &&
                            !allText.includes('Drop files here') &&
                            !allText.includes('No files selected') &&
                            (allText.includes('.') || allText.length > 3);
      
      if (hasFileContent) {
        return true;
      }
      
      if (isMultiple) {
        const hasFileElements = comp.element.querySelectorAll('.file-item, .uploaded-file-item, .file-preview, [data-file]').length > 0;
        if (hasFileElements) {
          return true;
        }
      }
    }
    
    return hasValue;
  }

  isComponentVisible(fieldPath) {
    if (!fieldPath || !this.root) return false;
    
    try {
      let component = null;
      
      if (fieldPath.startsWith('data.')) {
        const key = fieldPath.replace('data.', '');
        this.root.everyComponent((comp) => {
          if (comp.key === key) {
            component = comp;
            return false;
          }
        });
      } else if (fieldPath.includes('.')) {
        const pathParts = fieldPath.split('.');
        let currentComponent = this.root;
        
        for (const part of pathParts) {
          if (part.includes('[') && part.includes(']')) {
            const arrayName = part.split('[')[0];
            const index = parseInt(part.split('[')[1].split(']')[0]);
            
            if (currentComponent && currentComponent.components) {
              const arrayComponent = currentComponent.components.find(c => c.key === arrayName);
              if (arrayComponent && arrayComponent.rows && arrayComponent.rows[index]) {
                currentComponent = arrayComponent.rows[index];
              } else {
                return false;
              }
            } else {
              return false;
            }
          } else {
            if (currentComponent && currentComponent.components) {
              const foundComponent = currentComponent.components.find(c => c.key === part);
              if (foundComponent) {
                currentComponent = foundComponent;
              } else {
                return false;
              }
            } else {
              return false;
            }
          }
        }
        component = currentComponent;
      } else {
        this.root.everyComponent((comp) => {
          if (comp.key === fieldPath) {
            component = comp;
            return false;
          }
        });
      }
      
      if (!component) {
        return false;
      }
      
      const isVisible = !component.component?.hidden && 
                       !component.hidden && 
                       !component.disabled && 
                       !component.component?.disabled &&
                       component.visible !== false && 
                       component._visible !== false;
      
      return isVisible;
    } catch (error) {
      console.error('isComponentVisible: Error checking visibility for', fieldPath, error);
      return false;
    }
  }





  setupChangeListeners(panel) {
    setupChangeListeners(panel, this);
  }

  setupPanelHooks(panel, rowIndex) {
    setupPanelHooks(panel, rowIndex, this);
  }

  clearFileComponentErrors(comp) {
    if (!comp) return;
    
    if (comp.setCustomValidity) {
      comp.setCustomValidity([], false);
      // Battery optimization: Use requestAnimationFrame instead of setTimeout
      requestAnimationFrame(() => {
        comp.setCustomValidity([], false);
      });
    }
    
    if (comp._customErrors) {
      comp._customErrors = [];
    }
    
    if (comp.element) {
      const errorElements = comp.element.querySelectorAll('.formio-errors, .help-block, .invalid-feedback, .error-message');
      errorElements.forEach(el => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      
      comp.element.classList.remove('has-error', 'is-invalid', 'formio-error');
    }
    
    if (comp.redraw) {
      comp.redraw();
    }
    
    if (comp.triggerChange) {
      comp.triggerChange({ modified: true });
    }
    
    const root = comp.getRoot?.() || comp.root;
    if (root && root.triggerChange) {
      root.triggerChange({ modified: true });
    }
    
    let parent = comp.parent;
    while (parent) {
      if (parent.triggerChange) {
        parent.triggerChange({ modified: true });
      }
      parent = parent.parent;
    }
  }

  clearErrorsFromFileComponentsWithFiles() {
    if (!this.root?.everyComponent) return;
    
    this.root.everyComponent((component) => {
      const componentType = component.type || component.component?.type;
      if (componentType === 'file') {
        const isRequired = !!(component.component?.validate?.required || component.validate?.required);
        if (isRequired) {
          const hasFiles = this.checkFileComponentHasValue(component);
          if (hasFiles) {
            clearFieldErrors(component);
            
            if (component.parent && component.parent.type !== 'form') {
              clearFieldErrors(component);
            }
          }
        }
      }
    });
    
    this.clearErrorsFromNestedFormFileComponents();
  }

  clearErrorsFromNestedFormFileComponents() {
    if (!this.root?.everyComponent) return;
    
    this.root.everyComponent((component) => {
      if (component.type === 'form' || component.component?.type === 'form') {
        if (component.everyComponent) {
          component.everyComponent((nestedComponent) => {
            const nestedType = nestedComponent.type || nestedComponent.component?.type;
            if (nestedType === 'file') {
              const isRequired = !!(nestedComponent.component?.validate?.required || nestedComponent.validate?.required);
              if (isRequired) {
                const hasFiles = this.checkFileComponentHasValue(nestedComponent);
                if (hasFiles) {
                  clearFieldErrors(nestedComponent);
                }
              }
            }
          });
        }
      }
    });
  }

  async triggerValidation(options = {}) {
    const opts = {
      showErrors: true,
      scrollToError: true,
      showSummary: false,
      ...options
    };

    const results = await this.validateFormExternal({
      showErrors: opts.showErrors,
      scrollToError: opts.scrollToError,
      includeWarnings: true
    });

    if (opts.showSummary && !results.isValid) {
      this.showValidationErrorSummary(results);
    }

    return results;
  }

  showValidationErrorSummary(results) {
    const errorSummaryEl = this.createErrorSummaryElement();
    errorSummaryEl.innerHTML = this.generateErrorSummaryContent(results);
    document.body.appendChild(errorSummaryEl);
    this.setupErrorSummaryCloseButton(errorSummaryEl);
    this.setupErrorSummaryAutoDismiss(errorSummaryEl);
  }

  createErrorSummaryElement() {
    const errorSummaryEl = document.createElement('div');
    errorSummaryEl.className = 'alert alert-danger validation-summary';

    Object.assign(errorSummaryEl.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      maxWidth: '80%',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    });

    return errorSummaryEl;
  }

  generateErrorSummaryContent(results) {
    const errorListItems = Object.values(results.errors)
      .flatMap(item => item.errors.map(error => `<li>${item.label}: ${error}</li>`))
      .join('');

    return `
      <h4>Form Validation Errors</h4>
      <button type="button" class="close" style="position: absolute; top: 5px; right: 10px;">&times;</button>
      <p>Please fix the following errors:</p>
      <ul>${errorListItems}</ul>
    `;
  }

  setupErrorSummaryCloseButton(summaryElement) {
    const closeButton = summaryElement.querySelector('.close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        document.body.removeChild(summaryElement);
      });
    }
  }

  setupErrorSummaryAutoDismiss(summaryElement) {
    // Battery optimization: Store timeout ID for cleanup
    const timeoutId = setTimeout(() => {
      if (document.body.contains(summaryElement)) {
        document.body.removeChild(summaryElement);
      }
    }, 10000);
    this._timeoutIds.push(timeoutId);
  }

  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  async handleReviewClick() {
    try {
      const validation = await this.validateFormExternal({
        showErrors: true,
        scrollToError: true
      });

      try {
        await updateFormValues(this.root);
      } catch (e) {
        console.error("Error updating form values:", e);
      }

      return true;
    } catch (e) {
      console.error("Error in review button click handler:", e);
      alert("An error occurred while preparing the form for review. Please try again.");
      return false;
    }
  }

  async handleFormSubmission(modalData) {
    try {
      updateFormWithModalData(this.root, modalData);
      
      if (this.root && typeof this.root.submit === 'function') {
        await this.root.submit();
      }
    } catch (e) {
      if(Array.isArray(e) && e.length > 0 && e[0].ruleName){
        var inputErrors = ""
        inputErrors = e.map(err => `- ${err.message}`).join('\n');
        alert("Please fill all the following required fields and try again. \n" + inputErrors);
      }else{
        console.error("Error submitting form:", e);
        alert("An error occurred while submitting the form. Please try again.");
      }
    }
  }

  executeDataGridValidationScript(instance) {
    const p = instance.getParent ? instance.getParent() : instance.parent;
    if (!p) return;

    const currentRowErrors = [];

    if (p.setDirty) p.setDirty(true);

    p.everyComponent?.(c => {
      if (!c.visible) return;
      c.setDirty?.(true);
    });

    const fileTweaks = [];

    p.everyComponent?.(component => {
      if (!component || !component.visible) return;

      const type = component.type || component.component?.type;
      if (type !== 'file') return;

      const isRequired = !!(component.component?.validate?.required || component.validate?.required);
      if (!isRequired) return;

      // Check if file field has any files
      const dataValue = component.dataValue;
      const getVal = component.getValue && component.getValue();
      const getValStr = component.getValueAsString && component.getValueAsString();
      const domInputs = [];

      if (component.element) {
        const fileInputs = component.element.querySelectorAll('input[type="file"]');
        fileInputs.forEach?.(el => domInputs.push(el));
      }

      const serviceFiles = component.fileService?.files;
      const candidates = [dataValue, getVal, getValStr, component.files, serviceFiles];

      let hasValue = candidates.some((v) => hasActualFileData(v));

      if (!hasValue && domInputs.length) {
        for (var i = 0; i < domInputs.length; i++) {
          var inp = domInputs[i];
          if (inp?.files && inp.files.length > 0) {
            hasValue = true;
            break;
          }
        }
      }

      if (hasValue) {
        const comp = component;
        const wasRequired = !!(comp.component?.validate?.required || comp.validate?.required);
        const ptr = comp.component?.validate ? comp.component.validate
          : comp.validate ? comp.validate
            : (comp.component ? (comp.component.validate = {}) : (comp.validate = {}));
        if (ptr) {
          ptr.required = false;
        }
        fileTweaks.push({ comp, wasRequired, ptr });
      }
    });

    p.everyComponent?.(c => {
      if (!c.visible) return;
      c.error = '';
      if (c.setCustomValidity) {
        c.setCustomValidity([], false);
      }
    });

    p.everyComponent?.(c => {
      if (!c.visible) return;
      c.checkValidity?.(c.data, false, c.data);
      if (c.errors && c.errors.length > 0) {
        currentRowErrors.push(...c.errors);
      }
    });

    fileTweaks.forEach(t => {
      if (t.ptr && t.wasRequired) t.ptr.required = true;
    });

    p._customErrors = currentRowErrors;

    // Battery optimization: Use requestAnimationFrame for DOM operations
    requestAnimationFrame(() => {
      setTimeout(function () {
        function findNativeSave() {
          const eh = p.eventHandlers || [];
          for (let i = 0; i < eh.length; i++) {
            const obj = eh[i] && eh[i].obj;
            if (obj && obj.matches && obj.matches('button.btn.btn-success.formio-dialog-button')) {
              return obj;
            }
          }
          let modal = (p.refs && p.refs.modal) ? p.refs.modal : null;
          if (!modal) {
            const modals = document.querySelectorAll('.component-modal');
            modal = modals.length ? modals[modals.length - 1] : null;
          }
          return modal ? modal.querySelector('.modal-footer .btn.btn-success.formio-dialog-button') : null;
        }

        const nativeSave = findNativeSave();
        if (nativeSave) {
          // Battery optimization: Use requestAnimationFrame instead of setTimeout(0)
          requestAnimationFrame(() => {
            nativeSave.click();
          });
        } else if (instance.emit) {
          instance.emit('customEvent', { type: 'rowSaveProxy' });
        }

      if (currentRowErrors.length > 0) {
        const errorsPerField = {};
        const labels = [];
        currentRowErrors.map(function (e) {
          const label = e.component?.label || e.component?.key || 'Field';
          if (e.message.includes(label)) {
            e.message = e.message.replace(label, "");
          }
          if (!labels.includes(label)) {
            labels.push(label);
          }
          if( !errorsPerField[label]){
            errorsPerField[label] = [];
          }
          errorsPerField[label].push(e);
        });

        let msg = 'There are missing/invalid fields:\n\n';
        labels.map(function (fieldLabel) {
          msg= msg + `• ${fieldLabel}: \n`;
          errorsPerField[fieldLabel].map(function (err){
            msg= msg + `   - ${err.message}\n`;
          });
        });
        if (p.setDirty) p.setDirty(false);
        // Battery optimization: Use requestAnimationFrame for alert
        requestAnimationFrame(() => {
          try { window.alert(msg); } catch (_) {}
        });

        p._hasErrors = true;
        p._errorMap = {};
        currentRowErrors.forEach(function(err) {
          if (err.component && err.component.key) {
            p._errorMap[err.component.key] = err;
          }
        });

        // Battery optimization: Use requestAnimationFrame for DOM updates
        requestAnimationFrame(() => {
          addErrorHighlight(p.element);
        });
      } else {
        // Battery optimization: Use requestAnimationFrame for DOM updates
        requestAnimationFrame(() => {
          p._customErrors = [];
          p._hasErrors = false;
          p._errorMap = {};

          p.everyComponent?.(c => {
            if (c.error) c.error = '';
            if (c.setCustomValidity) {
              c.setCustomValidity([], false);
            }
          });

          removeErrorHighlight(p.element);
          if (p.redraw) {
            requestAnimationFrame(() => {
              p.redraw();
            });
          }
        });
      }
      }, 300);
    });

    setTimeout(function() {
        const root = p.root || p;
        let dataGrid = null;

        root.everyComponent(function(comp) {
          if (comp.component.key === 'dataGrid' && comp.component.type === 'datagrid') {
            dataGrid = comp;
          }
        });

        if (!dataGrid || !dataGrid.rows || dataGrid.rows.length === 0) {
          return;
        }

        function validateAllRows() {
          const allRowErrors = [];
          const rowsWithErrors = [];

          dataGrid.rows.forEach(function(row, rowIndex) {
            const rowErrors = [];
            const panelComponent = row.panel;
            if (!panelComponent) return;

            const rowFileTweaks = [];

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
                const fileInputs = component.element.querySelectorAll('input[type="file"]');
                fileInputs.forEach?.(function(inp) {
                  if (inp?.files && inp.files.length > 0) hasValue = true;
                });
              }

              if (hasValue) {
                const ptr = component.component?.validate ? component.component.validate
                  : component.validate ? component.validate
                    : (component.component ? (component.component.validate = {}) : (component.validate = {}));
                if (ptr) {
                  ptr.required = false;
                  rowFileTweaks.push({ component: component, ptr: ptr });
                }
              }
            }.bind(this));

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
              rowsWithErrors.push(rowIndex + 1);
              allRowErrors.push.apply(allRowErrors, rowErrors);

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

            setupPanelHooks(panelComponent, rowIndex);
          });

          dataGrid.rows.forEach(function(row, rowIndex) {
            const panelComponent = row.panel;
            if (!panelComponent) return;

            if (panelComponent._hasErrors && panelComponent._errorMap && Object.keys(panelComponent._errorMap).length > 0) {
              // Battery optimization: Use requestAnimationFrame for DOM updates
              requestAnimationFrame(() => {
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
          });
        }

        validateAllRows();

        if (!dataGrid._globalHooksAdded) {
          dataGrid._globalHooksAdded = true;

          const originalDataGridAttach = dataGrid.attach;
          dataGrid.attach = function(element) {
            const result = originalDataGridAttach.call(this, element);

            // Battery optimization: Use requestAnimationFrame for DOM operations
            requestAnimationFrame(() => {
              setTimeout(() => {
                dataGrid.rows.forEach((row, idx) => {
                  if (row.panel) {
                    setupPanelHooks(row.panel, idx);

                    if (row.panel._hasErrors) {
                      applyFieldErrors(row.panel);
                      if (row.panel.element) {
                        addErrorHighlight(row.panel.element);
                      }
                    }
                  }
                });
              }, 100); // Reduced from 200ms
            });

            return result;
          };

          const originalDataGridRedraw = dataGrid.redraw;
          dataGrid.redraw = function() {
            const result = originalDataGridRedraw ? originalDataGridRedraw.apply(this, arguments) : null;

            // Battery optimization: Use requestAnimationFrame for DOM operations
            requestAnimationFrame(() => {
              dataGrid.rows.forEach((row, idx) => {
                if (row.panel) {
                  setupPanelHooks(row.panel, idx);

                  if (row.panel._hasErrors) {
                    applyFieldErrors(row.panel);
                    if (row.panel.element) {
                      addErrorHighlight(row.panel.element);
                    }
                  }
                }
              });
            });

            return result;
          };

          const originalAddRow = dataGrid.addRow;
          dataGrid.addRow = function() {
            const result = originalAddRow.apply(this, arguments);

            // Battery optimization: Use requestAnimationFrame for DOM operations
            requestAnimationFrame(() => {
              setTimeout(() => {
                validateAllRows();

                dataGrid.rows.forEach((row, idx) => {
                  if (row.panel) {
                    setupPanelHooks(row.panel, idx);
                    if (row.panel._hasErrors) {
                      applyFieldErrors(row.panel);
                      if (row.panel.element) {
                        addErrorHighlight(row.panel.element);
                      }
                    }
                  }
                });
              }, 150); // Reduced from 300ms
            });

            return result;
          };

          const originalRemoveRow = dataGrid.removeRow;
          dataGrid.removeRow = function(rowIndex) {
            const result = originalRemoveRow.apply(this, arguments);

            // Battery optimization: Use requestAnimationFrame for DOM operations
            requestAnimationFrame(() => {
              setTimeout(() => {
                dataGrid.rows.forEach((row) => {
                  if (row.panel) {
                    row.panel._errorHooksAdded = false;
                    row.panel.everyComponent((comp) => {
                      if (comp) {
                        comp._hasValidationListener = false;
                      }
                    });
                  }
                });

                validateAllRows();

                dataGrid.rows.forEach((row, idx) => {
                  if (row && row.panel) {
                    setupPanelHooks(row.panel, idx);

                    if (row.panel._hasErrors) {
                      // Battery optimization: Use requestAnimationFrame for DOM updates
                      requestAnimationFrame(() => {
                        if (row.panel && row.panel.element) {
                          applyFieldErrors(row.panel);
                          addErrorHighlight(row.panel.element);
                        }
                      });
                    }
                  }
                });
              }, 200); // Reduced from 400ms
            });

            return result;
          };
        }

        dataGrid.rows.forEach((row, rowIndex) => {
          const panelComponent = row.panel;
          if (!panelComponent) return;

          if (panelComponent._hasErrors && panelComponent._errorMap && Object.keys(panelComponent._errorMap).length > 0) {
            applyFieldErrors(panelComponent);
            if (panelComponent.element) {
              addErrorHighlight(panelComponent.element);
            }
          } else {
            panelComponent._hasErrors = false;
            panelComponent._errorMap = {};
            if (panelComponent.element) {
              removeErrorHighlight(panelComponent.element);
            }
          }
        });

      }, 500);
    }

  countVisibleErrors (invalidFields, invalidComponents){
    // Count unique invalid field paths
    // Only count actual field paths, not extracted field names
    const uniqueErrorFields = new Set();
    
    // Normalize paths to remove duplicates and intermediate segments
    const normalizePath = (p) => {
      if (!p || typeof p !== 'string') return p;
      return p.replace(/\.data\./g, '.')
              .replace(/^data\./, '')
              .replace(/^form\./, '')
              .replace(/^submission\./, '')
              .replace(/\.panel(\d*)\./g, '.')
              .replace(/([^.]+)\.\1\./g, '$1.'); // Remove duplicate segments like "hardwareForm.hardwareForm"
    };
    
    // Process invalid fields directly - each unique normalized path is one error
    invalidFields.forEach(field => {
      if (field && typeof field === 'string') {
        const normalized = normalizePath(field);
        if (normalized) {
          uniqueErrorFields.add(normalized);
        }
      }
    });
    
    // Also check invalid components and add their paths (normalized)
    invalidComponents.forEach(comp => {
      if (comp && comp.path) {
        const normalized = normalizePath(comp.path);
        if (normalized) {
          uniqueErrorFields.add(normalized);
        }
      } else if (comp && comp.component && comp.component.key) {
        // Try to find the path in invalidFields that matches this component
        const compKey = comp.component.key;
        invalidFields.forEach(field => {
          if (field && typeof field === 'string') {
            const normalized = normalizePath(field);
            if (normalized && (normalized.endsWith('.' + compKey) || normalized === compKey || normalized.endsWith('[' + compKey + ']'))) {
              uniqueErrorFields.add(normalized);
            }
          }
        });
      }
    });
    
    return {
      uniqueErrorFields: Array.from(uniqueErrorFields),
      uniqueErrorFieldsCount: uniqueErrorFields.size,
      filteredInvalidFields: uniqueErrorFields,
      fieldErrorsCounter: uniqueErrorFields.size
    };
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {
      try {
        await Promise.resolve();

        await updateFormValuesBeforeReview(this.root);

        this.clearDataGridValidationState();
        
        const validationResults = await this.validateFormExternal({
          showErrors: true,
          scrollToError: false
        });
        
        this.clearErrorsFromFileComponentsWithFiles();
        
        // Battery optimization: Use requestAnimationFrame for DOM operations
        requestAnimationFrame(() => {
          this.clearErrorsFromFileComponentsWithFiles();
        });
        
        const invalidFields = new Set();
        const invalidComponents = new Set();
        
        if (this.root?.everyComponent) {
          this.root.everyComponent((component) => {
            try {
              if (component.component?.hidden === true || component.hidden === true) return;
              
              if (component.disabled === true || component.component?.disabled === true) {
                if (component.component?.reviewVisible !== true) return;
              }
              
              if (!component.visible || !component.checkValidity) return;

              const componentType = component.type || component.component?.type;
              if (componentType === 'datagrid' || componentType === 'datatable' || componentType === 'editgrid') {
                this.validateDataGridRows(component);
              }

              if (component.errors && component.errors.length > 0) {
                // Trim trailing spaces from keys
                const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
                const path = trimKey(component.path || component.key || '');
                
                if (componentType === 'file') {
                  const isValid = validateFileComponentWithRelaxedRequired(component);
                  
                  if (isValid) {
                    if (component.setCustomValidity) {
                      component.setCustomValidity([], false);
                    }
                    if (component.redraw) {
                      component.redraw();
                    }
                    if (component.checkValidity) {
                      component.checkValidity(component.data, true);
                    }
                    return;
                  }
                }
                
                if (path) {
                  // Trim trailing spaces from keys
                  const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
                  invalidFields.add(trimKey(path));
                  invalidComponents.add(component);
                }
              }
            } catch (err) {
              console.error(`Error checking component ${component.key}:`, err);
            }
          });
        }
        
        const validation = await this.validateFormExternal({
          showErrors: false,
          scrollToError: false
        });
        
        if (validation && validation.invalidComponents) {
          validation.invalidComponents.forEach(invalidComp => {
            // Trim trailing spaces from keys
            const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
            const path = trimKey(invalidComp.path || invalidComp.component?.path || invalidComp.component?.key || '');
            const component = invalidComp.component;
            if (path) {
              invalidFields.add(path);
            }
            if (component) {
              invalidComponents.add(component);
            }
          });
        }
        
        if (validation && validation.errors) {
          // Trim trailing spaces from keys
          const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
          Object.keys(validation.errors).forEach(errorPath => {
            // Only add the full error path, not extracted field names
            // This prevents duplicate counting
            invalidFields.add(trimKey(errorPath));
          });
        }

        const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } =
          await collectReviewLeavesAndLabels(this.root, invalidFields);

        const invalidFieldsArray = Array.from(invalidFields);

        // Console log: Data map and invalids
        console.log('=== Review Data Map ===');
        console.log('Leaves:', leaves.map(l => ({ 
          path: l.path, 
          label: l.label, 
          value: l.value,
          compKey: l.comp?.key || l.comp?.component?.key 
        })));
        console.log('Label By Path:', labelByPath);
        console.log('Meta By Path:', metaByPath);
        console.log('Index By Path:', indexByPath);
        console.log('=== Invalid Fields ===');
        console.log('Invalid Fields Set:', Array.from(invalidFields));
        console.log('Invalid Components:', Array.from(invalidComponents).map(c => ({
          key: c.key || c.component?.key,
          path: c.path,
          type: c.type || c.component?.type,
          errors: c.errors
        })));
        console.log('=== End Review Data Map ===');

        // Helper function to check if a path/component is a container (should be excluded from error counting)
        const isContainerPathOrComponent = (path, component) => {
          if (!component && !path) return false;
          
          const componentType = component?.type || component?.component?.type;
          const containerTypes = new Set(['panel', 'columns', 'well', 'fieldset', 'datamap', 'editgrid', 'table', 'tabs', 'row', 'column', 'content', 'htmlelement', 'datagrid', 'datatable', 'components']);
          
          if (componentType && containerTypes.has(componentType)) {
            return true;
          }
          
          // Also check path patterns for container components
          if (path) {
            const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
            const normalizedPath = trimKey(path)
              .replace(/\.data\./g, '.')
              .replace(/^data\./, '')
              .replace(/^form\./, '')
              .replace(/^submission\./, '');
            
            // Check if path ends with just a container name (like "dataGrid" or "dataGrid[0]")
            // but not a field within a container
            const pathParts = normalizedPath.split('.');
            const lastPart = pathParts[pathParts.length - 1];
            
            // If the path is just a container name or container[index], exclude it
            if (pathParts.length <= 2 && (lastPart.match(/^(dataGrid|datagrid|datatable|panel|well|table)(\[\d+\])?$/) || 
                containerTypes.has(lastPart.replace(/\[\d+\]/, '')))) {
              return true;
            }
            
            // Check if path matches container patterns like "hardwareForm.data.dataGrid" or "hardwareForm.data.dataGrid[0]"
            if (normalizedPath.match(/\.(dataGrid|datagrid|datatable)(\[\d+\])?$/) ||
                normalizedPath.match(/\.(panel|well|table)(\[\d+\])?$/)) {
              return true;
            }
          }
          
          return false;
        };
        
        // Filter out container components from invalid fields and components before counting
        const filteredInvalidFieldsForCount = new Set();
        invalidFieldsArray.forEach(fieldPath => {
          if (!isContainerPathOrComponent(fieldPath, null)) {
            filteredInvalidFieldsForCount.add(fieldPath);
          }
        });
        
        const filteredInvalidComponentsForCount = new Set();
        invalidComponents.forEach(component => {
          if (!isContainerPathOrComponent(component.path, component)) {
            filteredInvalidComponentsForCount.add(component);
          }
        });
        
        const invalidData = this.countVisibleErrors(Array.from(filteredInvalidFieldsForCount), filteredInvalidComponentsForCount);
        const filteredInvalidFields = invalidData.filteredInvalidFields || invalidData.uniqueErrorFields || filteredInvalidFieldsForCount;
        const fieldErrorsCounter = invalidData.uniqueErrorFieldsCount || invalidData.fieldErrorsCounter || filteredInvalidFieldsForCount.size;

        const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, this.root, filteredInvalidFields, invalidComponents);

        const allData = this.root?.submission?.data ?? this.root?.data ?? {};
        const supportNumber = allData?.billingCustomer || "Unavailable";

        let requireSupportFields = this.component.requireSupportFields !== false;
        
        if (!requireSupportFields && this.component.supportFieldsVisibilityLogic) {
          try {
            const customLogic = this.component.supportFieldsVisibilityLogic;
            const data = allData;
            const evalFunction = new Function('data', customLogic);
            const customResult = evalFunction(data);
            requireSupportFields = !!customResult;
          } catch (err) {
            console.error('Error evaluating support fields visibility logic:', err);
            requireSupportFields = false;
          }
        }

        const hasErrors = filteredInvalidFields.size > 0;
        
        // Create a Set of components that are actually in the review tree
        const visibleComponentsInTree = new Set();
        const visibleComponentKeys = new Set();
        const visibleComponentPaths = new Set();
        
        leaves.forEach(leaf => {
          if (leaf.comp) {
            visibleComponentsInTree.add(leaf.comp);
            const key = leaf.comp?.key || leaf.comp?.component?.key;
            const path = leaf.path;
            if (key) visibleComponentKeys.add(key);
            if (path) {
              visibleComponentPaths.add(path);
              // Also add normalized versions of the path
              const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
              const normalizedPath = trimKey(path)
                .replace(/\.data\./g, '.')
                .replace(/^data\./, '')
                .replace(/^form\./, '')
                .replace(/^submission\./, '')
                .replace(/\.panel[^.]*\./g, '.')
                .replace(/\.panel[^.]*$/, '');
              if (normalizedPath) visibleComponentPaths.add(normalizedPath);
            }
          }
        });
        
        // Helper function to check if a component is visible in the review tree
        const isComponentVisibleInTree = (component) => {
          if (!component) return false;
          // Check by component reference (most reliable)
          if (visibleComponentsInTree.has(component)) return true;
          
          // Check by component key
          const compKey = component.key || component.component?.key;
          if (compKey && visibleComponentKeys.has(compKey)) return true;
          
          // Check by component path (with normalization)
          const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
          const compPath = trimKey(component.path || component.component?.path || '');
          if (compPath) {
            // Check exact path
            if (visibleComponentPaths.has(compPath)) return true;
            
            // Check normalized path
            const normalizedPath = compPath
              .replace(/\.data\./g, '.')
              .replace(/^data\./, '')
              .replace(/^form\./, '')
              .replace(/^submission\./, '')
              .replace(/\.panel[^.]*\./g, '.')
              .replace(/\.panel[^.]*$/, '');
            if (normalizedPath && visibleComponentPaths.has(normalizedPath)) return true;
            
            // Check if any visible path ends with this component's key
            if (compKey) {
              for (const visiblePath of visibleComponentPaths) {
                if (visiblePath.endsWith('.' + compKey) || visiblePath === compKey) {
                  return true;
                }
              }
            }
          }
          
          return false;
        };
        
        // Helper function to check if a component is a container (should be excluded from error counting)
        const isContainerComponent = (component, path) => {
          return isContainerPathOrComponent(path, component);
        };
        
        // Collect detailed error messages for display (deduplicated, only from visible components, excluding containers)
        const errorDetailsMap = new Map();
        
        if (validation && validation.errors) {
          Object.entries(validation.errors).forEach(([errorPath, errorInfo]) => {
            if (errorInfo && errorInfo.errors && Array.isArray(errorInfo.errors)) {
              // Skip container component errors
              if (isContainerComponent(null, errorPath)) {
                return;
              }
              
              // Check if this error path corresponds to a visible component
              const trimKey = (k) => typeof k === 'string' ? k.trimEnd() : k;
              const normalizedErrorPath = trimKey(errorPath)
                .replace(/\.data\./g, '.')
                .replace(/^data\./, '')
                .replace(/^form\./, '')
                .replace(/^submission\./, '')
                .replace(/\.panel[^.]*\./g, '.')
                .replace(/\.panel[^.]*$/, '');
              
              // Check if any leaf matches this error path
              const matchingLeaf = leaves.find(leaf => {
                if (!leaf.comp) return false;
                
                // Skip if the leaf component is a container
                if (isContainerComponent(leaf.comp, leaf.path)) {
                  return false;
                }
                
                const leafPath = trimKey(leaf.path || '')
                  .replace(/\.data\./g, '.')
                  .replace(/^data\./, '')
                  .replace(/^form\./, '')
                  .replace(/^submission\./, '')
                  .replace(/\.panel[^.]*\./g, '.')
                  .replace(/\.panel[^.]*$/, '');
                const leafKey = trimKey(leaf.comp?.key || leaf.comp?.component?.key || '');
                
                // Exact match
                if (leafPath === normalizedErrorPath || leafKey === normalizedErrorPath) return true;
                
                // Check if paths end with the same field name
                const errorFieldName = normalizedErrorPath.split('.').pop();
                const leafFieldName = leafPath.split('.').pop();
                if (errorFieldName && leafFieldName && errorFieldName === leafFieldName) {
                  // Check if they're in the same container (same path up to the field name)
                  const errorContainer = normalizedErrorPath.substring(0, normalizedErrorPath.lastIndexOf('.'));
                  const leafContainer = leafPath.substring(0, leafPath.lastIndexOf('.'));
                  if (errorContainer === leafContainer || 
                      (errorContainer && leafContainer && (errorContainer.endsWith(leafContainer) || leafContainer.endsWith(errorContainer)))) {
                    return true;
                  }
                }
                
                return false;
              });
              
              if (matchingLeaf) {
                const fieldLabel = errorInfo.label || errorPath;
                errorInfo.errors.forEach(errorMsg => {
                  const errorMessage = typeof errorMsg === 'string' ? errorMsg : errorMsg.message || 'Invalid field';
                  const errorKey = `${fieldLabel}:${errorMessage}`;
                  if (!errorDetailsMap.has(errorKey)) {
                    errorDetailsMap.set(errorKey, {
                      field: fieldLabel,
                      message: errorMessage
                    });
                  }
                });
              }
            }
          });
        }
        
        // Also collect errors from invalid components (only if visible in tree and not a container)
        if (validation && validation.invalidComponents) {
          validation.invalidComponents.forEach(invalidComp => {
            const component = invalidComp.component;
            if (component && !isContainerComponent(component, invalidComp.path) && 
                isComponentVisibleInTree(component) && component.errors && Array.isArray(component.errors)) {
              const fieldLabel = invalidComp.label || component.component?.label || component.key || 'Unknown field';
              component.errors.forEach(errorMsg => {
                const errorMessage = typeof errorMsg === 'string' ? errorMsg : errorMsg.message || 'Invalid field';
                const errorKey = `${fieldLabel}:${errorMessage}`;
                if (!errorDetailsMap.has(errorKey)) {
                  errorDetailsMap.set(errorKey, {
                    field: fieldLabel,
                    message: errorMessage
                  });
                }
              });
            }
          });
        }
        
        // Also check invalidComponents Set for errors (only if visible in tree and not a container)
        invalidComponents.forEach(component => {
          if (component && !isContainerComponent(component, component.path) && 
              isComponentVisibleInTree(component) && component.errors && Array.isArray(component.errors)) {
            const fieldLabel = component.component?.label || component.key || 'Unknown field';
            component.errors.forEach(errorMsg => {
              const errorMessage = typeof errorMsg === 'string' ? errorMsg : errorMsg.message || 'Invalid field';
              const errorKey = `${fieldLabel}:${errorMessage}`;
              if (!errorDetailsMap.has(errorKey)) {
                errorDetailsMap.set(errorKey, {
                  field: fieldLabel,
                  message: errorMessage
                });
              }
            });
          }
        });
        
        const errorDetails = Array.from(errorDetailsMap.values());
        
        const modal = createReviewModal(hasErrors, fieldErrorsCounter, reviewHtml, supportNumber, requireSupportFields, errorDetails);

        let screenshotComp = null;
        this.root.everyComponent((comp) => {
          if (comp.component?.type === 'file' && comp.component?.key === 'screenshot') {
            screenshotComp = comp;
          }
        });

        const { allData: formData } = collectFormDataForReview(this.root);

        const screenshotControls = requireSupportFields ? setupScreenshotComponent(modal, screenshotComp, validateModalForm, formData, requireSupportFields) : null;

        setupModalEventHandlers(modal, screenshotComp, screenshotControls?.hide, validateModalForm, async (modalData) => {
          await this.handleFormSubmission(modalData);
        }, formData, requireSupportFields);

        document.body.appendChild(modal);
        
        const dropdown = document.querySelector('.custom-dropdown');
        const selected = dropdown ? dropdown.querySelector('.dropdown-selected') : null;
        const list = dropdown ? dropdown.querySelector('.dropdown-list') : null;

        selected?.addEventListener('click', () => {
          selected.classList.toggle("open");
          list.classList.toggle('open');
        });

        list?.addEventListener('click', function(e) {
          if (e.target.tagName === 'LI') {
            selected.querySelector(".selected-text").textContent = e.target.textContent;
            selected.setAttribute('data-value', e.target.textContent);
            list.classList.remove('open');
            selected.classList.remove('open');
            // Trigger initial change event to set correct visibility state (after screenshot setup)
            // Setup modal event handlers
            const verifiedSelect = modal.querySelector("#verified");
            const screenshotWrapper = modal.querySelector("#screenshotWrapper");
            const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
            const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");
            const hideScreenshot = screenshotControls?.hide;
            // Verification type change handler
            if (verifiedSelect) {
                const value = verifiedSelect.getAttribute('data-value');
                const needShot = value === "App" || value === "Support";

                // Show/hide wrapper divs
                if (screenshotWrapper) {
                  screenshotWrapper.style.display = needShot ? "block" : "none";
                }
                if (notesOptionalWrapper) {
                  notesOptionalWrapper.style.display = needShot ? "block" : "none";
                }
                if (notesRequiredWrapper) {
                  notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
                }

                // Show/hide screenshot component itself
                if (needShot && hideScreenshot && typeof hideScreenshot.show === 'function') {
                  hideScreenshot.show();
                } else if (!needShot && hideScreenshot && typeof hideScreenshot.hide === 'function') {
                  hideScreenshot.hide();
                  // Clear any validation styling when hiding
                  const screenshotContainer = modal.querySelector("#screenshotContainer");
                  if (screenshotContainer) {
                    screenshotContainer.style.border = "";
                    screenshotContainer.classList.remove("invalid-field");
                    // Also clear any validation on child elements
                    const childElements = screenshotContainer.querySelectorAll("*");
                    childElements.forEach(el => {
                      el.style.border = "";
                      el.classList.remove("invalid-field");
                    });
                  }
                }
            }
          }
        });

        document.addEventListener('mousedown', function(e) {
          if (!dropdown?.contains(e.target)) {
            list?.classList.remove('open');
          }
        });
        // Initial validation to set submit button state
        validateModalForm(modal, screenshotComp, formData, requireSupportFields);

        const verifiedSelect = modal.querySelector("#verified");
        if (verifiedSelect) {
          verifiedSelect.dispatchEvent(new Event("change"));
        }

      } catch (e) {
        console.error("Error in review button click handler:", e);
        alert("An error occurred while preparing the form for review. Please try again.");
      }
    });

    return super.attach(element);
  }

  // Battery optimization: Throttle redraw operations to reduce CPU usage
  throttledRedraw() {
    if (this._pendingRedraw) return;
    
    this._pendingRedraw = true;
    requestAnimationFrame(() => {
      if (typeof this.root?.redraw === 'function') {
        this.root.redraw();
      }
      this._pendingRedraw = false;
    });
  }

  // Battery optimization: Cleanup method to clear timeouts and cache
  destroy() {
    // Clear all timeouts
    if (this._timeoutIds) {
      this._timeoutIds.forEach(id => clearTimeout(id));
      this._timeoutIds = [];
    }
    
    // Clear DOM cache
    this._domCache = {};
    
    return super.destroy();
  }
}

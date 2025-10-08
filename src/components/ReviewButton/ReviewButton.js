import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";
import {
  isContainerType,
  shouldFlattenContainer,
  hasActualFileData,
  isAddressComponent,
  isDatagridLike,
  initializeValidationResults,
  initializeExternalValidationResults,
  createErrorResults,
  createExternalErrorResults,
  validateSelectedComponents,
  validateComponentsAndCollectResults,
  isFormValid,
  updateFormValues,
  generateErrorSummary,
  findComponentsToValidate,
  createReviewModal,
  validateModalForm,
  setupScreenshotComponent,
  setupModalEventHandlers,
  updateFormWithModalData,
  collectFormDataForReview,
  updateFormValuesBeforeReview,
  collectReviewLeavesAndLabels,
  renderLeaves
} from "./helpers/index.js";

const FieldComponent = Components.components.field;

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
    this.root.on("submitDone", () => {
      window.location.reload();
    });

    if (this.root) {
      this.registerFormValidationMethods();
      this.setupValidationEventHandler();
      this.exposeValidationMethods();
    }
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
          if (!component.errors) component.errors = [];
          const errorMessage = `${component.component?.label || component.key} is required.`;
          if (!component.errors.includes(errorMessage)) {
            component.errors.push(errorMessage);
          }

          setTimeout(() => {
            component.setCustomValidity(component.errors, true);
            component.redraw();
          }, 5000);

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
        // Skip validation for hidden components
        if (component.component?.hidden === true || component.hidden === true) return true;
        
        // Skip validation for disabled components unless they're marked review visible
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

      this.root.redraw();

      if (!isValid) {
        this.scrollToFirstError();
      }

      return isValid;
    } catch (err) {
      return false;
    }
  }

  scrollToFirstError() {
    const firstError = this.root.element.querySelector('.formio-error-wrapper, .has-error, .is-invalid');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const firstError = this.root?.element?.querySelector?.(
      '.formio-error-wrapper, .has-error, .is-invalid, [data-component-error="true"]'
    );
    if (firstError?.scrollIntoView) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    if (typeof this.root?.redraw === 'function') {
      await this.root.redraw();
    }

    if (scrollToError && !results.isValid && results.invalidComponents.length > 0) {
      const firstComponent = results.invalidComponents[0].component;
      if (firstComponent.element?.scrollIntoView) {
        firstComponent.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      console.log('validateFormExternal called with options:', opts);
      
      const results = initializeExternalValidationResults();
      
      // Force fresh validation by marking all components as dirty
      this.markAllComponentsAsDirty();
      this.markDatagridRowsAsDirty();
      
      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      console.log('Form data for validation:', data);

      const errorMap = new Map();
      const warningMap = new Map();

      if (this.root?.everyComponent) {
        console.log('Starting component validation...');
        await validateComponentsAndCollectResults(this.root, errorMap, warningMap, results, opts);
        console.log('Component validation completed. Error map size:', errorMap.size);
      }

      results.errors = Object.fromEntries(errorMap);
      results.warnings = Object.fromEntries(warningMap);
      generateErrorSummary(errorMap, results);

      console.log('Final validation results:', {
        isValid: results.isValid,
        errorCount: results.errorCount,
        invalidComponents: results.invalidComponents.length,
        errors: results.errors
      });

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
    if (typeof this.root?.redraw === 'function') {
      await this.root.redraw();

      if (!results.isValid && typeof this.root?.showErrors === 'function') {
        this.root.showErrors();
      }

      if (opts.scrollToError && !results.isValid) {
        this.scrollToFirstErrorAdvanced();
      }
    }

    // Apply row highlighting for data grid components
    if (!results.isValid) {
      this.applyDataGridRowHighlighting(results);
    } else {
      // Clear all row highlighting if form is valid
      this.clearAllDataGridRowHighlighting();
    }
  }

  applyDataGridRowHighlighting(results) {
    if (!this.root?.everyComponent) return;

    // Find all data grid components
    this.root.everyComponent((component) => {
      const componentType = component.type || component.component?.type;
      if (componentType === 'datagrid' || componentType === 'datatable' || componentType === 'editgrid') {
        this.highlightDataGridRows(component, results);
      }
    });
  }

  highlightDataGridRows(dataGrid, results) {
    if (!dataGrid.rows || !Array.isArray(dataGrid.rows)) return;

    console.log('highlightDataGridRows: Processing', dataGrid.rows.length, 'rows');

    dataGrid.rows.forEach((row, rowIndex) => {
      const panelComponent = row.panel;
      if (!panelComponent) {
        console.log('highlightDataGridRows: No panel component for row', rowIndex);
        return;
      }

      console.log('highlightDataGridRows: Processing row', rowIndex, 'panel:', panelComponent);

      // Check if this row has any validation errors
      let hasRowErrors = false;
      const rowErrors = [];

      if (panelComponent.everyComponent) {
        panelComponent.everyComponent((comp) => {
          try {
            // Skip validation for hidden components
            if (comp.component?.hidden === true || comp.hidden === true) {
              console.log('highlightDataGridRows: Skipping hidden component', comp.key, 'in row', rowIndex);
              return;
            }
            
            // Skip validation for disabled components unless they're marked review visible
            if (comp.disabled === true || comp.component?.disabled === true) {
              if (comp.component?.reviewVisible !== true) {
                console.log('highlightDataGridRows: Skipping disabled component', comp.key, 'in row', rowIndex);
                return;
              }
            }
            
            // Skip validation for invisible components
            if (!comp.visible || comp._visible === false) {
              console.log('highlightDataGridRows: Skipping invisible component', comp.key, 'in row', rowIndex);
              return;
            }

            // Special handling for file components - check if they actually have files
            const componentType = comp.type || comp.component?.type;
            if (componentType === 'file') {
              const isRequired = comp.component?.validate?.required || comp.validate?.required;
              if (isRequired) {
                const hasFile = this.checkFileComponentHasValue(comp);
                if (!hasFile) {
                  // File is required but missing
                  const errorMessage = `${comp.component?.label || comp.key} is required.`;
                  console.log('highlightDataGridRows: File component missing required file in row', rowIndex, 'component:', comp.key);
                  hasRowErrors = true;
                  rowErrors.push({ message: errorMessage, component: comp });
                } else {
                  console.log('highlightDataGridRows: File component has file in row', rowIndex, 'component:', comp.key);
                }
              }
            } else {
              // Check if component has errors using a safe method
              const hasErrors = comp.errors && comp.errors.length > 0;
              if (hasErrors) {
                console.log('highlightDataGridRows: Found errors in row', rowIndex, 'component:', comp.key, 'errors:', comp.errors);
                hasRowErrors = true;
                rowErrors.push(...comp.errors);
              }
            }
          } catch (err) {
            console.warn('highlightDataGridRows: Error accessing errors for component', comp.key, 'in row', rowIndex, err);
            // Try alternative error checking
            if (comp._customErrors && comp._customErrors.length > 0) {
              console.log('highlightDataGridRows: Found custom errors in row', rowIndex, 'component:', comp.key, 'errors:', comp._customErrors);
              hasRowErrors = true;
              rowErrors.push(...comp._customErrors);
            }
          }
        });
      }

      console.log('highlightDataGridRows: Row', rowIndex, 'hasRowErrors:', hasRowErrors, 'rowErrors:', rowErrors.length);

      // Apply or remove highlighting based on error state
      if (hasRowErrors) {
        console.log('highlightDataGridRows: Adding error highlight to row', rowIndex);
        this.addErrorHighlight(panelComponent.element);
        panelComponent._hasErrors = true;
        // Store errors in a custom property instead of the read-only errors property
        panelComponent._customErrors = rowErrors;
      } else {
        console.log('highlightDataGridRows: Removing error highlight from row', rowIndex);
        this.removeErrorHighlight(panelComponent.element);
        panelComponent._hasErrors = false;
        panelComponent._customErrors = [];
      }
    });
  }

  addErrorHighlight(element) {
    if (!element) {
      console.log('addErrorHighlight: No element provided');
      return;
    }
    
    console.log('addErrorHighlight: Adding highlight to element:', element);
    
    // Ensure CSS styles are available
    this.ensureErrorHighlightStyles();
    
    let rowContainer = element.closest('.formio-component-panel') ||
                       element.closest('[ref="row"]') ||
                       element.closest('.formio-component-columns') ||
                       element.closest('.list-group-item') ||
                       element.parentElement;
    
    if (!rowContainer || !rowContainer.classList) {
      let parent = element;
      for (let i = 0; i < 5; i++) {
        if (parent && parent.classList && (
            parent.classList.contains('formio-component') ||
            parent.hasAttribute('data-noattach') ||
            parent.classList.contains('row')
        )) {
          rowContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
    
    console.log('addErrorHighlight: Found rowContainer:', rowContainer);
    
    if (rowContainer && rowContainer.style) {
      console.log('addErrorHighlight: Applying styles to rowContainer');
      rowContainer.classList.add('has-error', 'alert', 'alert-danger');
      rowContainer.style.setProperty('border', '3px solid #dc3545', 'important');
      rowContainer.style.setProperty('border-left', '6px solid #dc3545', 'important');
      rowContainer.style.setProperty('background-color', '#f8d7da', 'important');
      rowContainer.style.setProperty('margin-bottom', '15px', 'important');
      rowContainer.style.setProperty('padding', '15px', 'important');
      rowContainer.style.setProperty('border-radius', '6px', 'important');
      rowContainer.style.setProperty('box-shadow', '0 2px 8px rgba(220, 53, 69, 0.3)', 'important');
      rowContainer.setAttribute('data-has-errors', 'true');
    } else {
      console.log('addErrorHighlight: Could not find suitable rowContainer or no style property');
    }
  }

  ensureErrorHighlightStyles() {
    if (document.getElementById('formio-row-error-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'formio-row-error-styles';
    style.textContent = `
      .formio-component-panel.has-error,
      .formio-component-panel.alert-danger,
      [ref="row"].has-error,
      [ref="row"].alert-danger,
      .formio-component-columns.has-error,
      .formio-component-columns.alert-danger,
      .list-group-item.has-error,
      .list-group-item.alert-danger {
        border: 3px solid #dc3545 !important;
        border-left: 6px solid #dc3545 !important;
        background-color: #f8d7da !important;
        margin-bottom: 15px !important;
        padding: 15px !important;
        border-radius: 6px !important;
        box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3) !important;
      }
      
      .formio-component-panel[data-has-errors="true"],
      [ref="row"][data-has-errors="true"],
      .formio-component-columns[data-has-errors="true"],
      .list-group-item[data-has-errors="true"] {
        border: 3px solid #dc3545 !important;
        border-left: 6px solid #dc3545 !important;
        background-color: #f8d7da !important;
        margin-bottom: 15px !important;
        padding: 15px !important;
        border-radius: 6px !important;
        box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3) !important;
      }
      
      /* Enhanced error highlighting for better visibility */
      .formio-component-panel.has-error .formio-component,
      [ref="row"].has-error .formio-component,
      .formio-component-columns.has-error .formio-component {
        border: 2px solid #dc3545 !important;
        background-color: #fff !important;
        border-radius: 4px !important;
      }
      
      .formio-component-panel.has-error .formio-component.has-error,
      [ref="row"].has-error .formio-component.has-error,
      .formio-component-columns.has-error .formio-component.has-error {
        border: 3px solid #dc3545 !important;
        background-color: #f8d7da !important;
        box-shadow: 0 0 0 0.3rem rgba(220, 53, 69, 0.4) !important;
        border-radius: 4px !important;
      }
      
      /* Make error messages more prominent */
      .formio-component-panel.has-error .formio-errors,
      [ref="row"].has-error .formio-errors,
      .formio-component-columns.has-error .formio-errors {
        background-color: #dc3545 !important;
        color: white !important;
        padding: 8px 12px !important;
        border-radius: 4px !important;
        margin-top: 8px !important;
        font-weight: bold !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      }
      
      /* Enhanced input field highlighting */
      .formio-component-panel.has-error input,
      .formio-component-panel.has-error select,
      .formio-component-panel.has-error textarea,
      [ref="row"].has-error input,
      [ref="row"].has-error select,
      [ref="row"].has-error textarea,
      .formio-component-columns.has-error input,
      .formio-component-columns.has-error select,
      .formio-component-columns.has-error textarea {
        border: 2px solid #dc3545 !important;
        background-color: #fff5f5 !important;
        box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
      }
      
      /* Pulsing animation for attention */
      @keyframes errorPulse {
        0% { box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3); }
        50% { box-shadow: 0 2px 12px rgba(220, 53, 69, 0.6); }
        100% { box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3); }
      }
      
      .formio-component-panel.has-error,
      [ref="row"].has-error,
      .formio-component-columns.has-error,
      .list-group-item.has-error {
        animation: errorPulse 2s infinite !important;
      }
    `;
    document.head.appendChild(style);
  }

  removeErrorHighlight(element) {
    if (!element) return;
    
    let rowContainer = element.closest('.formio-component-panel') ||
                       element.closest('[ref="row"]') ||
                       element.closest('.formio-component-columns') ||
                       element.closest('.list-group-item') ||
                       element.parentElement;
    
    if (!rowContainer || !rowContainer.classList) {
      let parent = element;
      for (let i = 0; i < 5; i++) {
        if (parent && parent.classList && (
            parent.classList.contains('formio-component') ||
            parent.hasAttribute('data-noattach') ||
            parent.classList.contains('row')
        )) {
          rowContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
    
    if (rowContainer && rowContainer.style) {
      rowContainer.classList.remove('has-error', 'alert', 'alert-danger');
      rowContainer.style.removeProperty('border');
      rowContainer.style.removeProperty('border-left');
      rowContainer.style.removeProperty('background-color');
      rowContainer.style.removeProperty('margin-bottom');
      rowContainer.style.removeProperty('padding');
      rowContainer.style.removeProperty('border-radius');
      rowContainer.style.removeProperty('box-shadow');
      rowContainer.style.removeProperty('animation');
      rowContainer.removeAttribute('data-has-errors');
    }
  }

  clearAllDataGridRowHighlighting() {
    if (!this.root?.everyComponent) return;

    // Find all data grid components and clear their row highlighting
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
        this.removeErrorHighlight(panelComponent.element);
        panelComponent._hasErrors = false;
        panelComponent._customErrors = [];
      }
    });
  }

  validateDataGridRows(dataGrid) {
    if (!dataGrid.rows || !Array.isArray(dataGrid.rows)) return;

    console.log('validateDataGridRows: Validating', dataGrid.rows.length, 'rows');

    dataGrid.rows.forEach((row, rowIndex) => {
      const panelComponent = row.panel;
      if (!panelComponent) {
        console.log('validateDataGridRows: No panel component for row', rowIndex);
        return;
      }

      console.log('validateDataGridRows: Validating row', rowIndex);

      // Clear existing errors first
      if (panelComponent.everyComponent) {
        panelComponent.everyComponent((comp) => {
          // Skip hidden, disabled, or invisible components
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

      // Run validation on all components in this row
      if (panelComponent.everyComponent) {
        panelComponent.everyComponent((comp) => {
          // Skip hidden, disabled, or invisible components
          if (comp.component?.hidden === true || comp.hidden === true) {
            console.log('validateDataGridRows: Skipping hidden component', comp.key, 'in row', rowIndex);
            return;
          }
          if (comp.disabled === true || comp.component?.disabled === true) {
            if (comp.component?.reviewVisible !== true) {
              console.log('validateDataGridRows: Skipping disabled component', comp.key, 'in row', rowIndex);
              return;
            }
          }
          if (!comp.visible || comp._visible === false) {
            console.log('validateDataGridRows: Skipping invisible component', comp.key, 'in row', rowIndex);
            return;
          }
          
          if (comp.checkValidity) {
            try {
              // Special handling for file components using enhanced validation
              const componentType = comp.type || comp.component?.type;
              if (componentType === 'file') {
                console.log('validateDataGridRows: Using enhanced file validation for', comp.key);
                const isValid = this.validateFileComponentWithRelaxedRequired(comp);
                console.log('validateDataGridRows: Enhanced file validation result:', isValid, 'for', comp.key);
                
                if (!isValid) {
                  // Manually set error for required file field without value
                  if (comp.setCustomValidity) {
                    const errorMessage = `${comp.component?.label || comp.key} is required.`;
                    comp.setCustomValidity([errorMessage], true);
                    console.log('validateDataGridRows: Set error for file component', comp.key, ':', errorMessage);
                  }
                } else {
                  // Clear errors for file field with value
                  if (comp.setCustomValidity) {
                    comp.setCustomValidity([], false);
                    console.log('validateDataGridRows: Cleared errors for file component', comp.key);
                  }
                  // Force component to redraw to update error display
                  if (comp.redraw) {
                    comp.redraw();
                  }
                  // Trigger validation to update component's internal state
                  if (comp.checkValidity) {
                    comp.checkValidity(comp.data, true);
                  }
                }
              } else {
                // For non-file components, use standard validation
                const isValid = comp.checkValidity(comp.data, true);
                console.log('validateDataGridRows: Row', rowIndex, 'component', comp.key, 'isValid:', isValid, 'errors:', comp.errors);
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
    console.log('checkFileComponentHasValue: Checking component', comp.key, {
      dataValue: comp.dataValue,
      hasGetValue: !!comp.getValue,
      files: comp.files,
      serviceFiles: comp.fileService?.files,
      element: !!comp.element,
      value: comp.value,
      rawValue: comp.rawValue,
      submissionValue: comp.submissionValue,
      isMultiple: isMultiple
    });

    // Check multiple sources for file data
    const dataValue = comp.dataValue;
    const getValue = comp.getValue && comp.getValue();
    const files = comp.files;
    const serviceFiles = comp.fileService?.files;
    const value = comp.value;
    const rawValue = comp.rawValue;
    const submissionValue = comp.submissionValue;
    
    // Additional checks for multi-file upload components
    const uploads = comp.uploads;
    const fileData = comp.fileData;
    const uploadedFiles = comp.uploadedFiles;
    const fileList = comp.fileList;
    
    // Check if any of these sources contain actual file data
    const hasValue = this.hasActualFileData(dataValue) ||
                    this.hasActualFileData(getValue) ||
                    this.hasActualFileData(files) ||
                    this.hasActualFileData(serviceFiles) ||
                    this.hasActualFileData(value) ||
                    this.hasActualFileData(rawValue) ||
                    this.hasActualFileData(submissionValue) ||
                    this.hasActualFileData(uploads) ||
                    this.hasActualFileData(fileData) ||
                    this.hasActualFileData(uploadedFiles) ||
                    this.hasActualFileData(fileList);
    
    console.log('checkFileComponentHasValue: Initial check result:', hasValue, {
      dataValueCheck: this.hasActualFileData(dataValue),
      getValueCheck: this.hasActualFileData(getValue),
      filesCheck: this.hasActualFileData(files),
      serviceFilesCheck: this.hasActualFileData(serviceFiles),
      valueCheck: this.hasActualFileData(value),
      rawValueCheck: this.hasActualFileData(rawValue),
      submissionValueCheck: this.hasActualFileData(submissionValue),
      uploadsCheck: this.hasActualFileData(uploads),
      fileDataCheck: this.hasActualFileData(fileData),
      uploadedFilesCheck: this.hasActualFileData(uploadedFiles),
      fileListCheck: this.hasActualFileData(fileList)
    });
    
    // If no value found in component properties, check DOM inputs and S3 uploads
    if (!hasValue && comp.element) {
      console.log('checkFileComponentHasValue: Checking DOM for files...');
      
      // Check for file inputs
      const fileInputs = comp.element.querySelectorAll('input[type="file"]');
      console.log('checkFileComponentHasValue: Found', fileInputs.length, 'file inputs');
      for (let i = 0; i < fileInputs.length; i++) {
        const input = fileInputs[i];
        if (input?.files && input.files.length > 0) {
          console.log('checkFileComponentHasValue: Found files in DOM input, count:', input.files.length);
          return true;
        }
        // For multi-select file inputs, also check if the input has the multiple attribute
        if (input?.hasAttribute('multiple') && input.files && input.files.length > 0) {
          console.log('checkFileComponentHasValue: Found multiple files in multi-select input, count:', input.files.length);
          return true;
        }
      }
      
      // Check for S3 uploaded files in the DOM
      const uploadedFiles = comp.element.querySelectorAll('.file-row, .uploaded-file, [data-file-id]');
      console.log('checkFileComponentHasValue: Found', uploadedFiles.length, 'uploaded file elements');
      if (uploadedFiles.length > 0) {
        console.log('checkFileComponentHasValue: Found', uploadedFiles.length, 'uploaded files in DOM');
        return true;
      }
      
      // Check for file lists or tables showing uploaded files
      const fileLists = comp.element.querySelectorAll('.file-list, .uploaded-files, table tbody tr');
      console.log('checkFileComponentHasValue: Found', fileLists.length, 'file list elements');
      for (let i = 0; i < fileLists.length; i++) {
        const list = fileLists[i];
        // Skip if it's just a header row or empty row
        if (list.textContent && list.textContent.trim() && 
            !list.textContent.includes('File Name') && 
            !list.textContent.includes('Size') &&
            !list.textContent.includes('Drop files') &&
            !list.textContent.includes('Browse Files')) {
          console.log('checkFileComponentHasValue: Found file in list:', list.textContent.trim());
          return true;
        }
      }
      
      // Special check for multi-file upload components - look for file rows in tables
      if (isMultiple) {
        console.log('checkFileComponentHasValue: Checking for multi-file upload files...');
        
        // Check for table rows that contain actual file data (not headers)
        const tableRows = comp.element.querySelectorAll('table tbody tr, .file-row, .upload-item');
        for (let i = 0; i < tableRows.length; i++) {
          const row = tableRows[i];
          const rowText = row.textContent || '';
          
          // Check if this row contains file information (filename, size, etc.)
          const hasFileName = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|avi|mov|webp|svg|bmp|tiff)$/i.test(rowText);
          const hasFileSize = /\d+\.?\d*\s*(kb|mb|gb|bytes?)/i.test(rowText);
          const hasDeleteButton = row.querySelector('.btn-delete, .delete-btn, [title*="delete"], [aria-label*="delete"]');
          
          if ((hasFileName || hasFileSize) && !rowText.includes('File Name') && !rowText.includes('Size')) {
            console.log('checkFileComponentHasValue: Found multi-file upload file in row:', rowText.trim());
            return true;
          }
        }
        
        // Check for file items in lists
        const fileItems = comp.element.querySelectorAll('.file-item, .uploaded-file-item, .file-preview');
        if (fileItems.length > 0) {
          console.log('checkFileComponentHasValue: Found', fileItems.length, 'file items in multi-file component');
          return true;
        }
      }
      
      // Check for any text content that looks like a filename
      const allText = comp.element.textContent || '';
      const filenamePattern = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|avi|mov)$/i;
      if (filenamePattern.test(allText)) {
        console.log('checkFileComponentHasValue: Found filename pattern in text:', allText);
        return true;
      }
      
      // Check for any elements with file-related classes or attributes
      const fileElements = comp.element.querySelectorAll('[class*="file"], [class*="upload"], [data-file], [data-upload]');
      if (fileElements.length > 0) {
        console.log('checkFileComponentHasValue: Found', fileElements.length, 'file-related elements');
        return true;
      }
      
      // Final fallback: check if the component has any meaningful content that suggests a file
      const hasFileContent = allText.trim().length > 0 && 
                            !allText.includes('No file') && 
                            !allText.includes('Choose file') &&
                            !allText.includes('Browse') &&
                            !allText.includes('Select file') &&
                            !allText.includes('Drop files here') &&
                            !allText.includes('No files selected') &&
                            (allText.includes('.') || allText.length > 3);
      
      if (hasFileContent) {
        console.log('checkFileComponentHasValue: Found meaningful content suggesting file:', allText.trim());
        return true;
      }
      
      // Special check for multi-select file components
      if (isMultiple) {
        // For multi-select components, check if there are any file-related elements
        const hasFileElements = comp.element.querySelectorAll('.file-item, .uploaded-file-item, .file-preview, [data-file]').length > 0;
        if (hasFileElements) {
          console.log('checkFileComponentHasValue: Found file elements in multi-select component');
          return true;
        }
      }
    }
    
    console.log('checkFileComponentHasValue: Final result for', comp.key, ':', hasValue);
    return hasValue;
  }

  isComponentVisible(fieldPath) {
    if (!fieldPath || !this.root) return false;
    
    try {
      // Find the component by path
      let component = null;
      
      // Handle different path formats
      if (fieldPath.startsWith('data.')) {
        const key = fieldPath.replace('data.', '');
        this.root.everyComponent((comp) => {
          if (comp.key === key) {
            component = comp;
            return false; // Stop iteration
          }
        });
      } else if (fieldPath.includes('.')) {
        // Handle nested paths like hardwareForm.data.dataGrid[0].picOfSn4
        const pathParts = fieldPath.split('.');
        let currentComponent = this.root;
        
        for (const part of pathParts) {
          if (part.includes('[') && part.includes(']')) {
            // Handle array indices like dataGrid[0]
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
            // Handle regular component keys
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
        // Simple key lookup
        this.root.everyComponent((comp) => {
          if (comp.key === fieldPath) {
            component = comp;
            return false; // Stop iteration
          }
        });
      }
      
      if (!component) {
        console.log('isComponentVisible: Component not found for path:', fieldPath);
        return false;
      }
      
      // Check visibility properties
      const isVisible = !component.component?.hidden && 
                       !component.hidden && 
                       !component.disabled && 
                       !component.component?.disabled &&
                       component.visible !== false && 
                       component._visible !== false;
      
      console.log('isComponentVisible: Component', fieldPath, 'visibility:', isVisible, {
        componentHidden: component.component?.hidden,
        hidden: component.hidden,
        disabled: component.disabled,
        componentDisabled: component.component?.disabled,
        visible: component.visible,
        _visible: component._visible
      });
      
      return isVisible;
    } catch (error) {
      console.error('isComponentVisible: Error checking visibility for', fieldPath, error);
      return false;
    }
  }

  hasActualFileData(value) {
    if (!value) return false;
    
    console.log('hasActualFileData: Checking value:', value, 'type:', typeof value);
    
    if (Array.isArray(value)) {
      // For multi-select file components, an empty array means no files
      if (value.length === 0) {
        console.log('hasActualFileData: Empty array - no files');
        return false;
      }
      
      const hasFiles = value.some(v => this.hasActualFileData(v));
      console.log('hasActualFileData: Array check result:', hasFiles, 'array length:', value.length);
      return hasFiles;
    }
    
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const hasContent = trimmed.length > 0 && trimmed !== '[]' && trimmed !== '{}';
      
      // Check if it looks like a filename
      const filenamePattern = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|avi|mov|webp|svg|bmp|tiff)$/i;
      const looksLikeFilename = filenamePattern.test(trimmed);
      
      console.log('hasActualFileData: String check result:', hasContent, 'looksLikeFilename:', looksLikeFilename, 'value:', trimmed);
      return hasContent || looksLikeFilename;
    }
    
    if (typeof value === 'object') {
      // Check for S3 file objects (Form.io file object)
      if (value.storage && (value.name || value.originalName || value.url || value.size)) {
        console.log('hasActualFileData: Found S3 file with storage');
        return true;
      }
      
      // Check for file objects with URL properties
      if (value.url || value.signedUrl || value.data || value.file) {
        console.log('hasActualFileData: Found file with URL/data');
        return true;
      }
      
      // Check for file objects with S3-specific properties
      if (value.key || value.bucket || value.region || value.uploadUrl) {
        console.log('hasActualFileData: Found S3 file with key/bucket');
        return true;
      }
      
      // Check for arrays of files
      if (Array.isArray(value.files) && value.files.length > 0) {
        console.log('hasActualFileData: Found files array');
        return true;
      }
      
      // Check for Form.io file service objects
      if (value.fileService && (value.fileService.files || value.fileService.uploads)) {
        console.log('hasActualFileData: Found file service');
        return true;
      }
      
      // Check if object has any file-like properties
      const fileLikeProps = ['name', 'size', 'type', 'lastModified', 'webkitRelativePath'];
      const hasFileProps = fileLikeProps.some(prop => value.hasOwnProperty(prop));
      if (hasFileProps) {
        console.log('hasActualFileData: Found file-like properties');
        return true;
      }
      
      console.log('hasActualFileData: Object check result: false');
      return false;
    }
    
    console.log('hasActualFileData: Final result: false');
    return false;
  }

  // Enhanced file validation method based on the provided approach
  validateFileComponentWithRelaxedRequired(comp) {
    if (!comp) return false;
    
    const isFile = (comp.type || comp.component?.type) === 'file';
    if (!isFile) return false;
    
    const isRequired = !!(comp.component?.validate?.required || comp.validate?.required);
    if (!isRequired) return true; // Not required, so always valid
    
    console.log('validateFileComponentWithRelaxedRequired: Checking file component', comp.key, 'isRequired:', isRequired);
    
    // Check multiple data sources for file presence
    const candidates = [
      comp.dataValue,
      comp.getValue?.(),
      comp.getValueAsString?.(),
      comp.files,
      comp.fileService?.files,
      comp.uploads,
      comp.fileData,
      comp.uploadedFiles,
      comp.fileList
    ];
    
    let hasVal = candidates.some(v => this.hasActualFileData(v));
    
    // Fallback to DOM <input type="file">
    if (!hasVal && comp.element) {
      const inputs = comp.element.querySelectorAll?.('input[type="file"]');
      for (const el of inputs) {
        if (el?.files && el.files.length > 0) { 
          hasVal = true; 
          break; 
        }
      }
    }
    
    console.log('validateFileComponentWithRelaxedRequired: hasVal:', hasVal, 'for component:', comp.key);
    
    if (hasVal) {
      // Clear errors immediately and force component update
      this.clearFileComponentErrors(comp);
      return true;
    }
    
    return false; // No files found, so invalid if required
  }

  // Direct method to clear file component errors
  clearFileComponentErrors(comp) {
    if (!comp) return;
    
    console.log('clearFileComponentErrors: Clearing errors for file component', comp.key);
    
    // Clear custom validity multiple times to ensure it sticks
    if (comp.setCustomValidity) {
      comp.setCustomValidity([], false);
      // Try again after a brief delay
      setTimeout(() => {
        comp.setCustomValidity([], false);
      }, 10);
    }
    
    // Clear any error-related properties
    if (comp._customErrors) {
      comp._customErrors = [];
    }
    
    // Clear error-related DOM elements
    if (comp.element) {
      const errorElements = comp.element.querySelectorAll('.formio-errors, .help-block, .invalid-feedback, .error-message');
      errorElements.forEach(el => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      
      // Remove error classes
      comp.element.classList.remove('has-error', 'is-invalid', 'formio-error');
    }
    
    // Force component to redraw
    if (comp.redraw) {
      comp.redraw();
    }
    
    // Trigger change event to update UI
    if (comp.triggerChange) {
      comp.triggerChange({ modified: true });
    }
    
    // Also try to clear from the root level
    const root = comp.getRoot?.() || comp.root;
    if (root && root.triggerChange) {
      root.triggerChange({ modified: true });
    }
    
    // For nested forms, also try to clear from parent form
    let parent = comp.parent;
    while (parent) {
      if (parent.triggerChange) {
        parent.triggerChange({ modified: true });
      }
      parent = parent.parent;
    }
    
    console.log('clearFileComponentErrors: Cleared errors for', comp.key);
  }

  // Clear errors from all file components that have files
  clearErrorsFromFileComponentsWithFiles() {
    if (!this.root?.everyComponent) return;
    
    console.log('clearErrorsFromFileComponentsWithFiles: Starting to clear errors from file components with files');
    
    this.root.everyComponent((component) => {
      const componentType = component.type || component.component?.type;
      if (componentType === 'file') {
        const isRequired = !!(component.component?.validate?.required || component.validate?.required);
        if (isRequired) {
          // Check if component has files
          const hasFiles = this.checkFileComponentHasValue(component);
          if (hasFiles) {
            console.log('clearErrorsFromFileComponentsWithFiles: Found file component with files:', component.key);
            this.clearFileComponentErrors(component);
            
            // For nested forms, also try to clear from the parent form context
            if (component.parent && component.parent.type !== 'form') {
              console.log('clearErrorsFromFileComponentsWithFiles: Also clearing from parent context for nested component:', component.key);
              this.clearFileComponentErrors(component);
            }
          }
        }
      }
    });
    
    // Also check for file components in nested forms
    this.clearErrorsFromNestedFormFileComponents();
    
    console.log('clearErrorsFromFileComponentsWithFiles: Completed clearing errors from file components');
  }

  // Specifically target file components in nested forms
  clearErrorsFromNestedFormFileComponents() {
    if (!this.root?.everyComponent) return;
    
    console.log('clearErrorsFromNestedFormFileComponents: Checking nested forms for file components');
    
    this.root.everyComponent((component) => {
      // Check if this is a nested form
      if (component.type === 'form' || component.component?.type === 'form') {
        console.log('clearErrorsFromNestedFormFileComponents: Found nested form:', component.key);
        
        // Check all components within this nested form
        if (component.everyComponent) {
          component.everyComponent((nestedComponent) => {
            const nestedType = nestedComponent.type || nestedComponent.component?.type;
            if (nestedType === 'file') {
              const isRequired = !!(nestedComponent.component?.validate?.required || nestedComponent.validate?.required);
              if (isRequired) {
                const hasFiles = this.checkFileComponentHasValue(nestedComponent);
                if (hasFiles) {
                  console.log('clearErrorsFromNestedFormFileComponents: Found file component with files in nested form:', nestedComponent.key);
                  this.clearFileComponentErrors(nestedComponent);
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
    setTimeout(() => {
      if (document.body.contains(summaryElement)) {
        document.body.removeChild(summaryElement);
      }
    }, 10000);
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
      // Update form with modal data
      updateFormWithModalData(this.root, modalData);
      
      // Submit the form
      if (this.root && typeof this.root.submit === 'function') {
        await this.root.submit();
      }
    } catch (e) {
      console.error("Error submitting form:", e);
      alert("An error occurred while submitting the form. Please try again.");
    }
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {
      try {
        await Promise.resolve();

        // Update form values before review
        await updateFormValuesBeforeReview(this.root);

        // Force a fresh validation every time the modal opens
        console.log('Starting fresh validation for modal...');
        
        // First, trigger validation and row highlighting on the main form
        const validationResults = await this.validateFormExternal({
          showErrors: true,
          scrollToError: false
        });
        
        // Clear errors from file components that have files
        this.clearErrorsFromFileComponentsWithFiles();
        
        // Additional pass to clear errors from nested form file components
        setTimeout(() => {
          this.clearErrorsFromFileComponentsWithFiles();
        }, 100);
        
        // Get invalid fields by validating the form fresh
        const invalidFields = new Set();
        const invalidComponents = new Set(); // Store component references too
        
        // First, let's also collect invalid fields from the current form state
        // This ensures we capture validation errors that might not be caught by validateFormExternal
        if (this.root?.everyComponent) {
          this.root.everyComponent((component) => {
            try {
              // Skip validation for hidden components
              if (component.component?.hidden === true || component.hidden === true) return;
              
              // Skip validation for disabled components unless they're marked review visible
              if (component.disabled === true || component.component?.disabled === true) {
                if (component.component?.reviewVisible !== true) return;
              }
              
              if (!component.visible || !component.checkValidity) return;

              // For data grid components, validate all rows
              const componentType = component.type || component.component?.type;
              if (componentType === 'datagrid' || componentType === 'datatable' || componentType === 'editgrid') {
                this.validateDataGridRows(component);
              }

              // Check if component has validation errors
              if (component.errors && component.errors.length > 0) {
                const path = component.path || component.key;
                console.log('Found component with errors:', {
                  path,
                  key: component.key,
                  errors: component.errors,
                  type: component.type || component.component?.type
                });
                
                // Special handling for file components - use enhanced validation
                const componentType = component.type || component.component?.type;
                if (componentType === 'file') {
                  console.log('File component error check - using enhanced validation for:', component.key);
                  const isValid = this.validateFileComponentWithRelaxedRequired(component);
                  console.log('File component enhanced validation result:', isValid, 'for component:', component.key);
                  
                  if (isValid) {
                    console.log('File component is valid, clearing errors for:', component.key);
                    // Clear errors if file component is valid
                    if (component.setCustomValidity) {
                      component.setCustomValidity([], false);
                    }
                    // Force component to redraw to update error display
                    if (component.redraw) {
                      component.redraw();
                    }
                    // Trigger validation to update component's internal state
                    if (component.checkValidity) {
                      component.checkValidity(component.data, true);
                    }
                    return; // Skip adding to invalid fields
                  }
                }
                
                if (path) {
                  invalidFields.add(path);
                  invalidComponents.add(component);
                  
                  // Add variations for data grid paths
                  if (path.includes('[') && path.includes(']')) {
                    const fieldName = path.split('.').pop();
                    if (fieldName) {
                      invalidFields.add(fieldName);
                    }
                    const pathWithoutIndex = path.replace(/\[\d+\]/, '[*]');
                    invalidFields.add(pathWithoutIndex);
                  }
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
        
        console.log('Fresh validation results:', validation);
        
        if (validation && validation.invalidComponents) {
          console.log('Invalid components found:', validation.invalidComponents);
          validation.invalidComponents.forEach(invalidComp => {
            const path = invalidComp.path || invalidComp.component?.path || invalidComp.component?.key;
            const component = invalidComp.component;
            console.log('Adding invalid field path:', path, 'from component:', invalidComp);
            if (path) {
              invalidFields.add(path);
              // Also add variations of the path for better matching
              if (path.includes('[') && path.includes(']')) {
                // For data grid paths like "datagrid[0].field", also add the field name alone
                const fieldName = path.split('.').pop();
                if (fieldName) {
                  invalidFields.add(fieldName);
                }
                // Add the path without the array index for broader matching
                const pathWithoutIndex = path.replace(/\[\d+\]/, '[*]');
                invalidFields.add(pathWithoutIndex);
              }
            }
            if (component) {
              invalidComponents.add(component);
            }
          });
        }
        
        // Also collect invalid fields from the errors object
        if (validation && validation.errors) {
          console.log('Processing errors object:', validation.errors);
          Object.keys(validation.errors).forEach(errorPath => {
            console.log('Adding error path from errors object:', errorPath);
            invalidFields.add(errorPath);
            // Add variations for data grid paths
            if (errorPath.includes('[') && errorPath.includes(']')) {
              const fieldName = errorPath.split('.').pop();
              if (fieldName) {
                invalidFields.add(fieldName);
              }
              const pathWithoutIndex = errorPath.replace(/\[\d+\]/, '[*]');
              invalidFields.add(pathWithoutIndex);
            }
          });
        }
        
        console.log('Final invalid fields set for modal:', Array.from(invalidFields));
        console.log('Final invalid components set for modal:', Array.from(invalidComponents));

        // Collect form data for review with invalid fields information
        // This will determine which fields to show based on current validation state
        const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } =
          await collectReviewLeavesAndLabels(this.root, invalidFields);

        // Filter invalid fields - only count visible, invalid components
        const filteredInvalidFields = new Set();
        const invalidFieldsArray = Array.from(invalidFields);
        
        invalidFields.forEach(field => {
          const fieldParts = field.split('.');
          const lastPart = fieldParts[fieldParts.length - 1];

          if (isContainerType(lastPart.toLowerCase()) || lastPart.endsWith(']')) {
            return;
          }
          
          const isParentContainer = invalidFieldsArray.some(otherField => 
            otherField !== field && otherField.startsWith(field + '.')
          );
          
          if (isParentContainer) return;
          
          const hasShorterVersion = invalidFieldsArray.some(otherField => {
            if (otherField === field || !field.includes('.')) return false;
            
            if (field.includes('[') && field.includes(']')) {
              return false;
            }
            
            if (field.includes('panel') || field.includes('fieldset') || field.includes('well') || field.includes('container')) {
              const lastSegment = field.split('.').pop();
              return otherField === lastSegment && !otherField.includes('[');
            }
            
            return (field.endsWith('.' + otherField) || 
                    (field.includes('.') && field === `form.data.${otherField}`) ||
                    (field.includes('.') && field === `data.${otherField}`)) &&
                   !otherField.includes('[');
          });
          
          if (hasShorterVersion) return;
          
          // Check if the component is visible before counting it
          const isVisible = this.isComponentVisible(field);
          if (isVisible) {
            filteredInvalidFields.add(field);
          } else {
            console.log('Filtering out hidden component from error count:', field);
          }
        });

        // Render the review content
        const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, this.root, filteredInvalidFields, invalidComponents);

        // Get support number
        const allData = this.root?.submission?.data ?? this.root?.data ?? {};
        const supportNumber = allData?.data?.billingCustomer || "Unavailable";

        // Create and show the review modal
        const hasErrors = filteredInvalidFields.size > 0;
        const fieldErrorCount = filteredInvalidFields.size;
        const modal = createReviewModal(hasErrors, fieldErrorCount, reviewHtml, supportNumber);

        // Find screenshot component
        let screenshotComp = null;
        this.root.everyComponent((comp) => {
          if (comp.component?.type === 'file' && comp.component?.key === 'screenshot') {
            screenshotComp = comp;
          }
        });

        // Get form data for validation
        const { allData: formData } = collectFormDataForReview(this.root);

        // Setup screenshot component if needed
        console.log('Setting up screenshot component:', !!screenshotComp);
        const screenshotControls = setupScreenshotComponent(modal, screenshotComp, validateModalForm, formData);
        console.log('Screenshot controls:', !!screenshotControls);

        // Setup modal event handlers
        setupModalEventHandlers(modal, screenshotComp, screenshotControls?.hide, validateModalForm, async (modalData) => {
          // Handle form submission
          await this.handleFormSubmission(modalData);
        }, formData);

        // No caching - always start fresh

        // Add modal to DOM
        document.body.appendChild(modal);

        // Initial validation to set submit button state
        validateModalForm(modal, screenshotComp, formData);

        // Trigger initial change event to set correct visibility state (after screenshot setup)
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
}

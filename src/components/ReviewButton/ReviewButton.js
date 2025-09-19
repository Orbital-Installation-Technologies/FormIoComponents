import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

const FieldComponent = Components.components.field;

const CONTAINER_TYPES = new Set(['panel', 'columns', 'well', 'fieldset', 'datamap', 'editgrid', 'table', 'tabs', 'row', 'column', 'content', 'htmlelement']);

const isContainerType = (t, exclude = []) => {
  if (!t) return false; // Early exit if no type

  if (!exclude || exclude.length === 0) {
    return Array.isArray(t)
      ? t.some(x => x && CONTAINER_TYPES.has(x))
      : CONTAINER_TYPES.has(t);
  }

  const excluded = new Set(exclude);
  const allowed = new Set([...CONTAINER_TYPES].filter(x => !excluded.has(x)));

  return Array.isArray(t)
    ? t.some(x => x && allowed.has(x))
    : allowed.has(t);
};

const FLATTEN_TYPES = new Set(['columns', 'fieldset', 'tabs', 'tagpad', 'survey', 'panel', 'well', 'container', 'datagrid', 'datatable']);

const shouldFlattenContainer = (t) => {
  if (!t) return false; // Early exit if no type

  if (Array.isArray(t)) {
    return t.some(type => type && FLATTEN_TYPES.has(type.toLowerCase()));
  }

  return FLATTEN_TYPES.has(t.toLowerCase());
};

const hasActualFileData = (value) => {
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.length > 0 && value.some(item => item && (item.name || item.filename || item.originalName || item.url || item.data));
  }
  if (typeof value === 'object') {
    return !!(value.name || value.filename || value.originalName || value.url || value.data || value.storage || value.size || (value.file && (value.file.name || value.file.url)));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 && (trimmed.startsWith('data:') || trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.includes('.'));
  }
  return false;
};

function findComponentByKey(root, targetKey, currentPath = '', parent = null) {
  if (!root || !targetKey) return null;

  const currentKey = root.key || root.component?.key;
  if (currentKey === targetKey) {
    return { component: root, path: currentPath, parent };
  }

  const buildPath = (base, keyOrIndex) => base ? `${base}.${keyOrIndex}` : `${keyOrIndex}`;

  if (Array.isArray(root.components)) {
    for (const child of root.components) {
      if (child) {
        const path = buildPath(currentPath, child.key || child.component?.key || root.components.indexOf(child));
        const found = findComponentByKey(child, targetKey, path, root);
        if (found) return found;
      }
    }
  }

  if (root.subForm && typeof root.subForm === 'object') {
    const path = buildPath(currentPath, 'subForm');
    const found = findComponentByKey(root.subForm, targetKey, path, root);
    if (found) return found;
  }

  if (Array.isArray(root.editRows)) {
    for (let i = 0; i < root.editRows.length; i++) {
      const row = root.editRows[i];
      if (row && Array.isArray(row.components)) {
        for (let j = 0; j < row.components.length; j++) {
          const child = row.components[j];
          if (child) {
            const path = buildPath(currentPath, `[${i}].${child.key || child.component?.key || j}`);
            const found = findComponentByKey(child, targetKey, path, row);
            if (found) return found;
          }
        }
      }
    }
  }

  if (Array.isArray(root.editForms)) {
    for (let i = 0; i < root.editForms.length; i++) {
      const form = root.editForms[i];
      if (form) {
        const path = buildPath(currentPath, `[${i}]`);
        const found = findComponentByKey(form, targetKey, path, root);
        if (found) return found;
      }
    }
  }

  return null;
}

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
        if (!component.visible || component.disabled || component._visible === false || component.component?.hidden) return true; // skip hidden/disabled

        if (!component.checkValidity) return true; // skip components without validation

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

        return true; // continue iteration
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
      const results = this.initializeValidationResults();
      const componentsToValidate = this.findComponentsToValidate(keys);
      await this.validateSelectedComponents(componentsToValidate, results, opts);

      if (opts.showErrors) {
        await this.updateUIWithErrors(results, opts.scrollToError);
      }

      return results;
    } catch (err) {
      return this.createErrorResults();
    }
  }

  
  initializeValidationResults() {
    return {
      isValid: true,
      fieldResults: {},
      errors: {},
      invalidComponents: []
    };
  }

  
  findComponentsToValidate(keys) {
    const componentsToValidate = [];

    if (this.root?.everyComponent) {
      this.root.everyComponent((component) => {
        try {
          if (keys.includes(component.key) || keys.includes(component.path)) {
            componentsToValidate.push(component);
          }
        } catch { }
      });
    }

    return componentsToValidate;
  }

  
  async validateSelectedComponents(components, results, options) {
    for (const component of components) {
      const { key, path, type, dataValue, component: componentDefinition} = component;
      const componentKey = key || path;
      const componentLabel = componentDefinition?.label || componentKey;
      const componentPath = path || componentKey;
      const isAddressComponent = componentDefinition?.type === 'address' || type === 'address';

      this.markComponentAsDirty(component);

      let isValid = true;

      // Normalize invalid address value
      if (isAddressComponent  && dataValue === '[object Object]') {
        component.dataValue = {};
      }

      if (component.checkValidity) {
        if (isAddressComponent  && componentDefinition?.validate?.required) {
           const addressValue = dataValue?.formattedPlace;
           const isAddressEmpty = !addressValue || addressValue.trim() === '';
          

          if (!isAddressEmpty)  {
            isValid = false;

            const addressError = `${componentDefinition?.label || key} is required.`;
            component.errors = Array.isArray(component.errors) ? component.errors : [];

            if (!component.errors.includes(addressError)) component.errors.push(addressError);
            if (component.setCustomValidity) {
                  component.setCustomValidity(component.errors, true);
            }

            if (component.redraw) {
                  component.redraw();
            }

          } else {
            isValid = component.checkValidity();
          }
        } else {
          isValid = component.checkValidity();
        }
      }

      this.recordComponentValidationResult(
        results,
        component,
        componentKey,
        componentLabel,
        componentPath,
        isValid,
        options.showErrors
      );
    }
  }

  
  markComponentAsDirty(component) {
    if (typeof component.setPristine === 'function') component.setPristine(false);
    if (typeof component.setDirty === 'function') component.setDirty(true);
  }

  
  recordComponentValidationResult(
    results,
    component,
    key,
    label,
    path,
    isValid,
    showErrors
  ) {
    const { fieldResults, errors, invalidComponents } = results;
    const errs = component.errors ?? [];

    fieldResults[key] = { isValid, errors: errs, label, path };

    // Stop if valid to avoid nesting
    if (isValid) return;

    results.isValid = false;

    errors[key] = { label, errors: errs.length ? errs : ['Invalid'] };
    invalidComponents.push({ component, path, label });

    if (showErrors && typeof component.setCustomValidity) {
      component.setCustomValidity(errs, true);
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

  
  createErrorResults() {
    return {
      isValid: false,
      fieldResults: {},
      errors: { system: { label: 'System', errors: ['Field validation failed'] } },
      invalidComponents: []
    };
  }

  
  async isFormValid() {
    try {
      const root = this.root;
      if (!root || !root.everyComponent) return true;
      const rootData = this.root?.data;
      const submissionData = this.root?.submission?.data;
      let isValid = true;

      const hasActualFileData = (value) => {
        if (!value) return false;
        if (Array.isArray(value)) {
          return  value.length > 0 && value.some(item => item && (item.name || item.filename || item.originalName || item.url || item.data));
        }
        if (typeof value === 'object') {
          return !!(
            value.name || value.filename || value.originalName || value.url || value.data ||
            value.storage || value.size || (value.file && (value.file.name || value.file.url))
          );
        }
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed.length > 0 && (
            trimmed.startsWith('data:') || trimmed.startsWith('http') || 
            trimmed.startsWith('/') || trimmed.includes('.')
          );
        }
        return false;
      };

      root.everyComponent((c) => {
        try {
          if (!c.checkValidity || c.visible === false || c.disabled) return;

          const comp = c.component;
          const type = c.type || comp?.type;
          const componentKey = c.key || comp.key;

          // Address component check
          const isAddressComponent = type === 'address';
          if (isAddressComponent  && c.dataValue === '[object Object]') {
            c.dataValue = {};
          }

          if (isAddressComponent && comp.validate?.required) {
            const addressValue = c.dataValue?.formattedPlace;
            const isAddressEmpty = !addressValue || addressValue.trim() === '';   
            if (isAddressEmpty) {
                 isValid = false;
                 return;
            }
          } 
          // File component check
          else if (type === 'file' && (comp.validate?.required || c.validate?.required)) {
            const hasValue = 
              hasActualFileData(c.dataValue) ||
              hasActualFileData(c.data) ||
              (rootData && componentKey && hasActualFileData(rootData[componentKey])) ||
              (submissionData && componentKey && hasActualFileData(submissionData[componentKey])) ||
              (c.files && Array.isArray(c.files) && c.files.length > 0);

            if (!hasValue) {
              isValid = false;
              return;
            }
          } 
          // Other components
          else if (!c.checkValidity()) {
            isValid = false;
            return;
          }
        } catch {  }
      });

      return isValid;
    } catch (e) {
      console.error('isFormValid check error:', e);
      return false;
    }
  }


  
  async validateFormExternal(options = {}) {
    const opts = {
      showErrors: true,
      scrollToError: true,
      includeWarnings: true,
      ...options
    };

    try {
      const results = this.initializeExternalValidationResults();
      this.markAllComponentsAsDirty();
      const data = this.root?.submission?.data ?? this.root?.data ?? {};

      const errorMap = new Map();
      const warningMap = new Map();

      if (this.root?.everyComponent) {
        await this.validateComponentsAndCollectResults(errorMap, warningMap, results, opts);
      }

      results.errors = Object.fromEntries(errorMap);
      results.warnings = Object.fromEntries(warningMap);
      this.generateErrorSummary(errorMap, results);

      if (opts.showErrors) {
        await this.handleExternalValidationUIUpdates(results, opts);
      }

      return results;
    } catch (err) {
      return this.createExternalErrorResults();
    }
  }

  
  initializeExternalValidationResults() {
    return {
      isValid: true,
      errorCount: 0,
      warningCount: 0,
      errors: {},
      warnings: {},
      invalidComponents: [],
      errorSummary: ''
    };
  }

  
  async validateComponentsAndCollectResults(errorMap, warningMap, results, opts) {
    const { includeWarnings, showErrors } = opts || {};

    const isAddressComponent = (component) =>
      component.component?.type === 'address' || component.type === 'address';


    const hasActualFileData = (value) => {
      if (!value) return false;
      if (Array.isArray(value)) {
        return value.length > 0 && value.some(item =>
          item && (item.name || item.filename || item.originalName || item.url || item.data)
        );
      }
      if (typeof value === 'object') {
        return !!(
          value.name || value.filename || value.originalName || value.url ||
          value.data || value.storage || value.size ||
          (value.file && (value.file.name || value.file.url))
        );
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return (
          trimmed.length > 0 &&
          (
          	trimmed.startsWith('data:') || // base64 data URL
       	trimmed.startsWith('http') ||  // HTTP URL
          	trimmed.startsWith('/') ||     // file path
          	trimmed.includes('.') // has file extension
          )
        );
      }
      return false;
    };


    const getNestedValue = (obj, path) => {
      if (!obj || !path) return null;
      return path.split('.').reduce((acc, p) => (acc && typeof acc === 'object' ? acc[p] : null), obj);
    };

    this.root.everyComponent((component) => {
      try {
        if (!component.visible || component.disabled || !component.checkValidity) return;

        // ---------- Address components ----------
        if (isAddressComponent(component)) {
          if (component.dataValue === '[object Object]') component.dataValue = {};
          if (component.component?.validate?.required) {
            const addressValue = component.dataValue?.formattedPlace;
            const isAddressEmpty = !addressValue || addressValue.trim() === '';
            if (isAddressEmpty) {
              if (!component.errors) component.errors = [];
              const addressError = `${component.component?.label || component.key} is required.`;
              if (!component.errors.includes(addressError)) component.errors.push(addressError);
              if (component.setCustomValidity) {
                  component.setCustomValidity(component.errors, true);
              }
              if (component.redraw) {
                  component.redraw();
              }

              this.processComponentErrors(component, errorMap, results, showErrors);
              return;
            }
          }
          if (!component.checkValidity()) {
            this.processComponentErrors(component, errorMap, results, showErrors);
          }
          if (includeWarnings && component.warnings?.length) {
            this.processComponentWarnings(component, warningMap, results);
          }
          return;
        }

        // ---------- File components ----------
        const componentType = component.type || component.component?.type;
        if (componentType === 'file') {
          const isRequired = component.component?.validate?.required || component.validate?.required;
          let hasValue = false;

          const dataValue = component.dataValue;
          const componentData = component.data;
          const getValue =  component.getValue && component.getValue();
          const getValueAsString = component.getValueAsString && component.getValueAsString();
          const nestedData = component.component?.data;
          const privateData = component._data;

          const rootData = this.root?.data;
          const submissionData = this.root?.submission?.data;
          const componentKey = component.key || component.component?.key;
          const rootComponentData = rootData && componentKey ? rootData[componentKey] : null;
          const submissionComponentData = submissionData && componentKey ? submissionData[componentKey] : null;

          const componentPath = component.path || component.key;

          const nestedPathData = getNestedValue(rootData, componentPath);
          const nestedSubmissionPathData = getNestedValue(submissionData, componentPath);

          const candidates = [
            dataValue, componentData, getValue, getValueAsString,
            nestedData, privateData, rootComponentData, submissionComponentData,
            nestedPathData, nestedSubmissionPathData
          ];

          hasValue = candidates.some(hasActualFileData);

          if (!hasValue && component.files && Array.isArray(component.files) && component.files.length > 0) hasValue = true;
          if (!hasValue && component.element) {
            const fileInputs = component.element.querySelectorAll('input[type="file"]');
            for (const input of fileInputs) {
              if (input.files && input.files.length > 0) {
                hasValue = true;
                break;
              }
            }
          }
          const files = component.fileService.files;
          if (!hasValue && component.fileService && files && Array.isArray(files) && files.length > 0) {
            hasValue = true;
          }

          const isValid = !isRequired || hasValue;
          if (!isValid) {
            this.processComponentErrors(component, errorMap, results, showErrors);
          }
          if (includeWarnings && component.warnings?.length) {
            this.processComponentWarnings(component, warningMap, results);
          }
          return;
        }

        // ---------- Other components ----------
        const isValid = component.checkValidity();
        if (!isValid) {
          this.processComponentErrors(component, errorMap, results, showErrors);
        }
        if (includeWarnings && component.warnings?.length) {
          this.processComponentWarnings(component, warningMap, results);
        }
      } catch (err) {
        console.error(`Error validating component ${component.key}:`, err);
      }
    });
  }

  
  processComponentErrors(component, errorMap, results, showErrors) {
    results.isValid = false;
    results.errorCount++;

    const componentKey = component.key || component.path;
    const componentLabel = component.component?.label || componentKey;
    const componentPath = component.path || componentKey;

    const errors = component.errors;
    if (!errors || !errors.length) return;     // this early check will skip almost all work
    if (errors && errors.length) {
      // Get or create the entry once
      let entry = errorMap.get(componentPath);
      if (!entry) {
        entry = { label: componentLabel, errors: [] };
        errorMap.set(componentPath, entry);
      }
      errors.forEach(error => {
               entry.errors.push(error);
      });
    }

    results.invalidComponents.push({
      component,
      path: componentPath,
      label: componentLabel
    });

    if (showErrors && errors && errors.length) {
      component.setCustomValidity(errors, true);
    }
  }

  
  processComponentWarnings(component, warningMap, results) {
    results.warningCount += component.warnings.length;

    const componentKey = component.key || component.path;
    const componentLabel = component.component?.label || componentKey;
    const componentPath = component.path || componentKey;

    if (!warningMap.has(componentPath)) {
      warningMap.set(componentPath, {
        label: componentLabel,
        warnings: []
      });
    }

    component.warnings.forEach(warning => {
      warningMap.get(componentPath).warnings.push(warning);
    });
  }

  
  generateErrorSummary(errorMap, results) {
    const errorSummaryLines = [];

    errorMap.forEach((data, path) => {
      data.errors.forEach(error => {
        errorSummaryLines.push(`${data.label}: ${error}`);
      });
    });

    results.errorSummary = errorSummaryLines.join('\n');
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
  }

  
  createExternalErrorResults() {
    return {
      isValid: false,
      errorCount: 1,
      warningCount: 0,
      errors: { system: { label: 'System', errors: ['An unexpected error occurred during validation'] } },
      warnings: {},
      invalidComponents: [],
      errorSummary: 'An unexpected error occurred during validation'
    };
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
    }, 10000); // 10 seconds
  }

  
  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  
  async updateFormValues() {
    try {
      await Promise.resolve(); // if you don't need exactly to wait for 100ms, this can do the work

      const allDatagrids = [];
      const isDatagridLike = (comp) =>
        comp?.component?.type === 'datagrid' || comp?.component?.type === 'datatable';

      if (this.root && typeof this.root.everyComponent === 'function') {
        try {
          this.root.everyComponent((comp) => {
            if (isDatagridLike(comp)) allDatagrids.push(comp);
          });
        } catch (e) {
          console.error("Error collecting datagrids/datatables:", e);
        }
      }

      if (allDatagrids.length) {
        for (const datagrid of allDatagrids) {
          try {
            this.updateDatagridValues(datagrid);
          } catch (e) {
            console.error("Error updating datagrid/datatable values:", e);
          }
        }
      }

      try {
        this.updateTopLevelComponentValues();
      } catch (e) {
        console.error("Error updating top-level components:", e);
      }
    } catch (e) {
      console.error("Error in updateFormValues:", e);
    }
  }

  
  updateDatagridValues(datagrid) {
    if (!datagrid) return;

    // --- Update the datagrid's own value ---
    const hasUpdateValue = datagrid.updateValue && typeof datagrid.updateValue === 'function';
    if (hasUpdateValue) {
      try {
        datagrid.updateValue();
      } catch (e) {
        console.error("Error updating datagrid value:", e);
      }
    }

   // --- Handle datatable savedRows ---
    const isDatatable = datagrid.component?.type === 'datatable';

    if (isDatatable && Array.isArray(datagrid.savedRows)) {
      const savedRows = datagrid.savedRows;
      savedRows.forEach(row => {
          if (row && Array.isArray(row.components)) {
          const rowComponents = row.components;
            rowComponents.forEach(component => {
              this.safelyUpdateComponent(component, 'datatable row component');
            });
          }
        });
      return; // nothing else to do for datatable
    }

    // --- Handle datagrid rows ---
    if (Array.isArray(datagrid.rows)) {
      const rows = datagrid.rows;
      rows.forEach(row => {
          if (row && typeof row === 'object') {
            const values = Object.values(row);
            values.forEach(component => {
              this.safelyUpdateComponent(component, 'datagrid row component');
            });
          }
        });
    }
  }

  
  safelyUpdateComponent(component, context) {
    if (!component) return;

    const componentType = component.type;

    if (componentType === 'select') {
      const choices = component.choices;
      if (!Array.isArray(choices)) {
        console.warn(`Skipping Select component update in ${context} - missing choices array`);
        return;
      }
    }

    const componentUpdateValue = component.updateValue;
    if (componentUpdateValue  && typeof componentUpdateValue === 'function') {
      try {
        if (componentType === 'select' && typeof component.resetValue !== 'function') {
          console.warn(`Select component in ${context} missing resetValue method - skipping update`);
          return;
        }
        component.updateValue();
      } catch (e) {
        console.error(`Error updating component value in ${context}:`, e);
      }
    }
  }

  
  updateTopLevelComponentValues() {
    if (Array.isArray(this.root.components)) {
      this.root.components.forEach(comp => {
        this.safelyUpdateComponent(comp, 'top-level component');
      });
    }
  }

  
  async handleReviewClick() {
    try {
      const validation = await this.validateFormExternal({
        showErrors: true,
        scrollToError: true
      });

      try {
        await this.updateFormValues();
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

  
  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {


      try {
        await Promise.resolve();

        const allDatagrids = [];
        this.root.everyComponent(comp => {
          const componentType = comp.component?.type || comp.type;
          
          if (componentType  === 'well' || componentType === 'table') {
            allDatagrids.push(comp);
          }
        });
        for (const datagrid of allDatagrids) {
          try {
            if (datagrid.updateValue) {
              datagrid.updateValue();
            }
            if (datagrid.component?.type === 'datatable' && datagrid.savedRows) {
	   const savedRows = datagrid.savedRows;
               savedRows.forEach(row => {
                if (row.components) {
                  const rowComponents = row.components;
                  rowComponents.forEach(component => {
                    if (component && component.updateValue) {
                      component.updateValue();
                    }
                  });
                }
              });
            } else if (datagrid.rows) {
              const datagridRows = datagrid.rows;
              datagridRows.forEach(row => {
                const values = Object.values(row);
                values.forEach(component => {
                  if (component && component.updateValue) {
                    component.updateValue();
                  }
                });
              });
            }
          } catch (e) {
            console.error("Error updating datagrid/datatable values:", e);
          }
        }
        const rootComponents = this.root.components;
        rootComponents.forEach(comp => {
          if (comp.updateValue && typeof comp.updateValue === 'function') {
            try {
              comp.updateValue();
            } catch (e) { }
          }
        });
      } catch (e) { }

      
      const customComponentForReview = (component) => {
        if (!component) return null; // at the beginning of the function
        
        const label = component.component?.label || component.label || component.key || 'Unnamed';
        const key = component.component?.key || component.key;
        const componentType = component.component?.type || component.type;
        const data = component.data || component._data || component.dataValue || {};
        const rootInstance = component.root || component.parent?.root || null;

        if (componentType === 'table' || componentType === 'datatable') {
          const colDefs = Array.isArray(component.components) ? component.components : [];
          const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
          const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

          let dataRows = [];
          const componentPath = component.path || component.key || '';
          if (Array.isArray(component.table) && component.table.length > 0 && Array.isArray(component.table[0])) {
            dataRows = component.table.map(rowArr => {
              const rowObj = {};
              columnKeys.forEach((colKey, idx) => {
                rowObj[colKey] = rowArr[idx];
              });
              return rowObj;
            });
          } else {
            dataRows = Array.isArray(component.dataValue) ? component.dataValue :
              Array.isArray(component.rows) ? component.rows :
                Array.isArray(component.savedRows) ? component.savedRows.map(row => row.data || {}) :
                  Array.isArray(rootInstance?.data?.[key]) ? rootInstance.data[key] :
                    Array.isArray(component._data?.[key]) ? component._data[key] : [];
          }

          // Transpose: Each field becomes a row, each data row becomes a column
          const tableRows = [];
          
          colDefs.forEach((col, colIdx) => {
            const colKey = col.key || col.component?.key;
            const colLabel = columnLabels[colIdx] || colKey;

            if (!colKey) return;

            const rowData = [];
            
            // For each data row, create a column entry containing the field value
            dataRows.forEach((rowObj, dataRowIdx) => {
              const val = typeof rowObj === 'object' ? rowObj[colKey] : '';
              rowData.push({
                _children: {
                  _label: `Row ${dataRowIdx + 1}`, // Label for the data row
                  _key: `${colKey}_row_${dataRowIdx}`,
                  _type: col.type || col.component?.type,
                  _leaf: true,
                  _value: val
                }
              });
            });

            // Create a table row for this field
            tableRows.push({ 
              _row: rowData,
              _fieldLabel: colLabel, // Store the field label for potential use
              _fieldKey: colKey
            });
          });
          
          return {
            _label: label,
            _key: key,
            _type: componentType,
            _row: tableRows
          };
        } else if (isContainerType(componentType)) {
          const children = component.components || [];
          
          if (shouldFlattenContainer(componentType)) {
            const childItems = children.filter(child => {
              return child.component?.reviewVisible || child?.component.validate.required;
            })
            .map(child => {
              const childKey = child.key || child.path || '';
              const childValue = child.dataValue || (data[childKey] || '');
              return {
                _label: child.label || child.key || 'Unnamed',
                _key: childKey,
                _type: child.type || child.component?.type,
                _leaf: true,
                _value: childValue
              };
            });
            
            return childItems.length > 0 ? childItems : null;
          }
          
          const containerItems = children.filter(child => {
            return child.component?.reviewVisible || child?.component.validate.required;
          }) 
          .map(child => {
            const childKey = child.key || child.path || '';
            const childValue = child.dataValue || (data[childKey] || '');
            return {
              _children: {
                _label: child.label || child.key || 'Unnamed',
                _key: childKey,
                _type: child.type || child.component?.type,
                _leaf: true,
                _value: childValue
              }
            };
          });
          return {
            _label: label,
            _key: key,
            _type: componentType,
            _row: containerItems
          };
        }
        return {
          _label: label,
          _key: key,
          _type: componentType,
          _leaf: true,
          _value: component.dataValue || ''
        };
      };

      async function collectReviewLeavesAndLabels(root) {
        const stats = {
          leafComponents: 0,
          containers: 0
        };



        const pushedPaths = new Set();

        
        const canon = (p = '') => {
          let normalized = p
            .replace(/^form\./, '')
            .replace(/^submission\./, '')
            .replace(/(^|\.)data(\.|$)/g, '$1')
            .replace(/\.data\./g, '.')
            .replace(/^\d+\./, '')     // Remove leading array indices
            .replace(/\.\d+\./g, '.'); // Remove intermediate array indices

          if (normalized.includes('[')) {
            const matches = normalized.match(/^(.+?)(\[\d+\].*)$/);
            if (matches) {
              const basePath = matches[1];
              const arrayPart = matches[2];
              normalized = `${basePath}${arrayPart}`;
            }
          }

          return normalized;
        };

        
        const pushLeaf = (leaf) => {
          const norm = canon(leaf.path);
          if (!norm || pushedPaths.has(norm)) return;
          pushedPaths.add(norm);
          leaves.push(leaf);
        };

        const topIndexMap = new Map();
        if (Array.isArray(root?.components)) {
          root.components.forEach((c, i) => {
            const k = c?.component?.key || c?.key;
            if (k) topIndexMap.set(k, i);
          });
        }
        const topIndexFor = (comp) => {
          let p = comp;
          while (p?.parent && p.parent !== root) p = p.parent;
          const topKey = p?.component?.key || p?.key;
          return topIndexMap.has(topKey) ? topIndexMap.get(topKey) : -1;
        };

        if (root.ready) await root.ready;
        let leaves = [];
        const labelByPathMap = new Map();
        const metaByPathMap = new Map();
        const indexByPathMap = new Map();
        const suppressLabelForKey = new Set(['data']);
        const queue = [];
        const processedPaths = new Set();

        const enqueueAll = (f) => {
          if (!f || !f.everyComponent) {
            return;
          }
          const prefix = f.__reviewPrefix || '';

          f.everyComponent((c) => {
            const shouldSkip = c.parent && (isContainerType(c.parent.component?.type));
            if (shouldSkip) {
              return;
            }
            if (prefix) c.__prefix = prefix;
            queue.push(c);
          });
        };

        const safePath = (c) => (c?.__reviewPath) || (c?.__prefix ? `${c.__prefix}${c.path}` : c?.path);

        enqueueAll(root);

        while (queue.length) {
          const comp = queue.shift();
          if (!comp) continue;

          const isAddressComponentEarly = comp.component?.type === 'address' || comp.type === 'address';

          const isEditGridComponentEarly = comp.component?.type === 'editgrid' || comp.type === 'editgrid';
          
          if (comp?._visible == false || ((!comp?.component.reviewVisible && !comp?.component.validate.required) && !isAddressComponentEarly && !isEditGridComponentEarly)) continue;

          if (comp.type === 'button' || comp.component?.type === 'button') continue;

          if (comp.component?.type === 'datamap') {
            const dataMapPath = safePath(comp);
            indexByPathMap.set(dataMapPath, topIndexFor(comp));

            if (Array.isArray(comp.rows) && comp.rows.length) {
              comp.rows.forEach((row, rIdx) => {
                const keyComp = row.__key;
                const valueComp = row.value;

                const key = keyComp ? (keyComp.getValue ? keyComp.getValue() : keyComp.dataValue) : '';
                const value = valueComp ? (valueComp.getValue ? valueComp.getValue() : valueComp.dataValue) : '';
                if(!key) return;
                pushLeaf({
                  comp: keyComp,
                  path: `${dataMapPath}[${rIdx}].key`,
                  label: key,
                  value: value,
                  formIndex: topIndexFor(comp)
                });
              });
            }
            continue;
          }

          if (comp.component?.type === 'editgrid') {
            const gridPath = safePath(comp);
            indexByPathMap.set(gridPath, topIndexFor(comp));

            let colDefs = Array.isArray(comp.components) ? comp.components : [];
            const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
            const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

            const editgridMeta = {
              kind: 'editgrid',
              columnKeys,
              columnLabels
            };
            metaByPathMap.set(gridPath, editgridMeta);

            pushLeaf({
              comp: comp,
              path: gridPath,
              label: comp.component?.label || comp.label || comp.key || 'Edit Grid',
              value: Array.isArray(comp.editRows) ? `${comp.editRows.length} row(s)` : 'No data entered',
              formIndex: topIndexFor(comp)
            });

            if (Array.isArray(comp.editRows) && comp.editRows.length) {
              comp.editRows.forEach((r, rIdx) => {
                (r.components || []).forEach((ch) => {
                  let value = null;
                  if ('getValue' in ch && typeof ch.getValue === 'function') {
                    value = ch.getValue();
                  } else if (ch.dataValue !== undefined) {
                    value = ch.dataValue;
                  } else if (ch.value !== undefined) {
                    value = ch.value;
                  }

                  const chPath = `${gridPath}[${rIdx}].${ch.key || 'Missing Value 4'}`;
                  pushLeaf({
                    comp: comp,
                    path: chPath,
                    label: ch.component?.label || ch.label || ch.key || 'Missing Value 4',
                    value: value,
                    formIndex: topIndexFor(comp)
                  });
                });
              });
            }
            continue;
          }

          const compPath = safePath(comp);
          if (compPath && processedPaths.has(compPath)) {
            continue;
          }

          if (compPath) processedPaths.add(compPath);

          if (comp.type === 'form') {
            if (comp.subFormReady) await comp.subFormReady;

            const formContainerPath = safePath(comp);

            indexByPathMap.set(formContainerPath, topIndexFor(comp));

            if (comp.subForm) {
              comp.subForm.__reviewPrefix = comp.path ? `${formContainerPath}.` : '';
              enqueueAll(comp.subForm);
            } else {
              if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
                indexByPathMap.set(comp.path, topIndexFor(comp));
              } else {
                indexByPathMap.set(comp.path, topIndexFor(comp));
              }
            }
            continue;
          }

          if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
            const gridPath = safePath(comp);
            indexByPathMap.set(gridPath, topIndexFor(comp));

            let colDefs = Array.isArray(comp.components) ? comp.components : [];
            const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
            const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

            const pushValueLeaf = (node, basePath) => {
              pushLeaf({
                comp: node,
                path: basePath,
                label: node.component?.label || node.label || node.key || 'Missing Value 1',
                value: ('getValue' in node) ? node.getValue() : node.dataValue,
                formIndex: topIndexFor(node)
              });
            };

            const flattenCell = (node, basePath) => {
              if (!node) return;
              const t = node.component?.type || node.type;

              if (t === 'form' && node.subForm) {
                node.subForm.__reviewPrefix = `${basePath}.`;
                node.subForm.everyComponent?.((ch) => {
                  const chPath = `${basePath}.${ch.path || ch.key || 'Missing Value 2'}`;
                  if (isContainerType(ch.component?.type || ch.type)) {
                    flattenCell(ch, chPath);
                  } else {
                    pushValueLeaf(ch, chPath);
                  }
                });
                return;
              }

              if (t === 'columns' && Array.isArray(node.columns)) {
                node.columns.forEach((col, ci) => {
                  (col.components || []).forEach((ch) => {
                    const chPath = `${basePath}.${ch.key || ch.path || `col${ci}`}`;
                    flattenCell(ch, chPath);
                  });
                });
                return;
              }

              if (isContainerType(t) && Array.isArray(node.components)) {
                node.components.forEach((ch) => {
                  const chPath = `${basePath}.${ch.key || ch.path || 'Missing Value 3'}`;
                  flattenCell(ch, chPath);
                });
                return;
              }

              pushValueLeaf(node, basePath);
            };

            const datagridMeta = {
              kind: comp.component?.type,
              columnKeys,
              columnLabels
            };
            metaByPathMap.set(gridPath, datagridMeta);

            if (comp.component?.type === 'datatable') {
              const dataRows =
                Array.isArray(comp.dataValue) ? comp.dataValue :
                  Array.isArray(root?.data?.[comp.key]) ? root.data[comp.key] :
                    Array.isArray(comp._data?.[comp.key]) ? comp._data[comp.key] : [];

              const processedFields = new Map();
              dataRows.forEach((rowObj, rIdx) => {
                if (!processedFields.has(rIdx)) processedFields.set(rIdx, new Set());
                const rowDone = processedFields.get(rIdx);
                colDefs.forEach((c, i) => {
                  const cKey = c.key || c.component?.key || c.path;
                  const cLabel = columnLabels[i] || cKey;
                  if (!cKey || rowDone.has(cKey)) return;
                  const val = rowObj?.[cKey];
                  pushLeaf({
                    comp: comp,
                    path: `${gridPath}[${rIdx}].${cKey}`,
                    label: cLabel,
                    value: val,
                    formIndex: topIndexFor(comp)
                  });
                  rowDone.add(cKey);
                });
              });
              continue;
            }

            if (comp.component?.type === 'editgrid' && Array.isArray(comp.editRows) && comp.editRows.length) {
              comp.editRows.forEach((row, rIdx) => {
                (row.components || []).forEach((cellComp) => {
                  const colKey = cellComp.key || cellComp.component?.key || 'unknown';
                  const base = `${gridPath}[${rIdx}].${colKey}`;
                });
              });
              continue;
            }

            if (Array.isArray(comp.rows) && comp.rows.length) {
              comp.rows.forEach((row, rIdx) => {
                Object.entries(row).forEach(([colKey, cellComp]) => {
                  const base = `${gridPath}[${rIdx}].${colKey}`;
                  flattenCell(cellComp, base);
                });
              });
            }
            continue;
          }

          if ((comp.component?.type === 'datagrid' && !comp.rows) ||
            (comp.component?.type === 'datatable' && !comp.savedRows) ||
            (comp.component?.type === 'editgrid' && !comp.editRows)) {
            continue;
          }

          

          if (comp.component?.type === 'table') {
            const tablePath = safePath(comp) || comp.key;
            indexByPathMap.set(tablePath, topIndexFor(comp));

            if (!pushedPaths.has(canon(tablePath))) {
              pushLeaf({
                comp: comp,
                path: tablePath,
                label: comp.component?.label || comp.label || comp.key || 'Table',
                value: customComponentForReview(comp),
                formIndex: topIndexFor(comp)
              });
            }
            if (Array.isArray(comp.components)) {
              comp.components.forEach(child => {
                const childKey = child.key || child.path || '';
                const childPath = `${tablePath}.${childKey}`;
                indexByPathMap.set(childPath, topIndexFor(comp));
                if (!pushedPaths.has(canon(childPath))) {
                  pushLeaf({
                    comp: child,
                    path: childPath,
                    label: child.component?.label || child.label || childKey,
                    value: ('getValue' in child) ? child.getValue() : child.dataValue,
                    formIndex: topIndexFor(comp)
                  });
                }
              });
            }
          }

          if (comp.component?.type === 'tagpad') {
            const tagpadPath = safePath(comp);

            const forms = Array.isArray(comp.editForms) ? comp.editForms : [];
            const tagpadArray = Array.isArray(comp._data?.tagpad) ? comp._data.tagpad : [];

            const formIndex = topIndexFor(comp);

            if (forms.length === 0) {
              leaves.push({
                comp: comp,
                path: `${tagpadPath}[0]`,
                label: 'Tag 1',
                value: {},
                formIndex: formIndex
              });
            } else {
              forms.forEach((form, idx) => {
                const basePath = `${tagpadPath}[${idx}]`;
                const formLabel = `Tag ${idx + 1}`;
                indexByPathMap.set(basePath, formIndex);

                const formData = (form && form.data) ? form.data : (tagpadArray[idx] || {});
                const formComps = Array.isArray(form?.components) ? form.components : [];

                if (formComps.length === 0) {
                  leaves.push({
                    comp: form || comp,
                    path: basePath,
                    label: formLabel,
                    value: formData || {},
                    formIndex: formIndex
                  });
                } else {
                  formComps.forEach((ch) => {
                    const key =
                      ch?.key ||
                      ch?.path ||
                      ch?.component?.key;
                    if (!key) return;

                    let val = (formData && Object.prototype.hasOwnProperty.call(formData, key))
                      ? formData[key]
                      : ('getValue' in ch ? ch.getValue() : (ch.dataValue ?? ''));

                    leaves.push({
                      comp: ch,
                      path: `${basePath}.${key}`,
                      label: ch.component?.label || ch.label || key,
                      value: val,
                      formIndex: formIndex
                    });
                  });
                }
              });
            }

            continue;
          }

          if (Array.isArray(comp.components) && comp.components.length) {
            const containerPath = safePath(comp);
            const componentType = comp.type || comp.component?.type;

            const isContainer = isContainerType([comp.type, comp.component?.type]);

            if (shouldFlattenContainer(componentType)) {
              comp.components.forEach((ch) => queue.push(ch));
              continue;
            }

            if (isContainer) {
              if (!comp.component) {
                comp.component = {};
              }
            }

            indexByPathMap.set(containerPath, topIndexFor(comp));
            comp.components.forEach((ch) => queue.push(ch));
            continue;
          }

          const parent = comp?.parent;
          const parentType = parent?.component?.type;
          const parentsToBeHandled = ['datatable', 'datagrid', 'tagpad', 'datamap', 
                                      'panel', 'well', 'table', 'tabs', 'fieldset', 'columns'];
          const parentIsHandled = parentsToBeHandled.includes(parentType) && 
                                  !shouldFlattenContainer(parentType);

          const isInTagpadForm =
            parent && parentType === 'tagpad' &&
            comp.__reviewPath && comp.__reviewPath.includes('[') && comp.__reviewPath.includes(']');

          const isTagpadComponent = comp.type === 'tagpad' || comp.component?.type === 'tagpad' || isInTagpadForm;

          const isContentComponent = comp?.type === 'content' || comp?.component?.type === 'content' ||
                                     comp?.type === 'htmlelement' || comp?.component?.type === 'htmlelement';

          const componentPath = safePath(comp);
          const pathParts = (componentPath || '').split('.');
          const hasArrayNotation = componentPath && componentPath.includes('[') && componentPath.includes(']');
          const isGridChild = hasArrayNotation || pathParts.some(part => /^\d+$/.test(part));

          const isFormComponent = comp.type === 'form' || comp.component?.type === 'form';
          const isPanelComponent = comp.type === 'panel' || comp.component?.type === 'panel';
          const componentType = comp.component?.type || comp.type;

          if (shouldFlattenContainer(componentType)) {
            continue;
          }

          if (isPanelComponent) {
            const panelPath = safePath(comp);
            indexByPathMap.set(panelPath, topIndexFor(comp));

            if (!comp.component) {
              comp.component = {};
            }

            if (Array.isArray(comp.components) && comp.components.length > 0) {
              comp.components.forEach(child => {
                if (!child.component) {
                  child.component = {};
                }
              });
            }
          }

          const isContainerComponent = isContainerType([comp.type, comp.component?.type]);

          if (comp.component?.type === 'well' || comp.type === 'well' ||
            comp.component?.type === 'table' || comp.type === 'table') {
            customComponentForReview(comp);
          }
          
          if (isPanelComponent || isContainerComponent) {
            if (!comp.component) comp.component = {};
            comp.component.reviewVisible = true;

            if (comp.components && comp.components.length > 0) {
              const processedContainer = customComponentForReview(comp);
              
              if (processedContainer) {
                leaves.push(processedContainer);
              }
              
              comp.components.forEach(childComp => {
                if (childComp && !processedPaths.has(safePath(childComp))) {
                  queue.push(childComp);
                }
              });
            }
          }

          const isAddressComponentMain = comp.component?.type === 'address' || comp.type === 'address';

          if (
            !parentIsHandled &&
            !isContentComponent &&
            !isGridChild &&
            comp.visible !== false &&
            (comp.component?.reviewVisible === true || comp?.component.validate?.required || isTagpadComponent || isFormComponent || isPanelComponent || isContainerComponent || isAddressComponentMain)
          ) {
            let componentValue;
            if (isFormComponent) {
              componentValue = comp.data || comp.submission?.data || comp.dataValue || {};
            } else if (isPanelComponent || isContainerComponent) {
              const customStructure = customComponentForReview(comp);
              componentValue = customStructure;
            } else {
              componentValue = ('getValue' in comp) ? comp.getValue() : comp.dataValue;
            }


            if (isAddressComponentMain) {
              componentValue = comp.dataValue?.formattedPlace || "";
            }

            pushLeaf({
              comp: comp,
              path: comp.__reviewPath || safePath(comp) || comp.key,
              label: comp.component?.label || comp.key,
              value: componentValue,
              formIndex: topIndexFor(comp),
              customStructure: (isPanelComponent && !shouldFlattenContainer([comp.type, comp.component?.type])) || 
                               (isContainerComponent && !shouldFlattenContainer([comp.type, comp.component?.type])) ? true : false
            });
          }
        }
        if (Array.isArray(root?.components)) {
          root.components.forEach(comp => {
            const containerType = comp.component?.type || comp.type;
            const isContainer = isContainerType([comp.type, comp.component?.type], ['table']) &&
                          Array.isArray(comp.components) && comp.components.length > 0;

            if (shouldFlattenContainer(containerType)) {
              return;
            }

            if (isContainer) {
              let panelPath = safePath(comp);

              const panelInLeaves = leaves.some(leaf =>
                (leaf.path === panelPath || leaf.comp === comp)
              );

              if (!panelInLeaves) {
                if (panelPath == "") {
                  panelPath = comp.key;
                }

                const panelFormIndex = topIndexFor(comp);
                indexByPathMap.set(panelPath, panelFormIndex);

                const isWell = containerType === 'well';
                const containerLabel = comp.component?.label || comp.key || (isWell ? 'Well' : 'Panel');

                pushLeaf({
                  comp: comp,
                  path: panelPath,
                  label: "",
                  value: isWell ? '(Well contents)' : '(Panel contents)',
                  formIndex: panelFormIndex
                });

                comp.components.forEach(childComp => {
                  const childKey = childComp.key || childComp.path || 'child';
                  const childPath = `${panelPath}.${childKey}`;
                  indexByPathMap.set(childPath, panelFormIndex);

                  pushLeaf({
                    comp: childComp,
                    path: childPath,
                    label: childComp.component?.label || childKey,
                    value: ('getValue' in childComp) ? childComp.getValue() : childComp.dataValue,
                    formIndex: panelFormIndex
                  });
                });
              }
            }
          });
        }

        const labelByPath = {};
        labelByPathMap.forEach((value, key) => {
          labelByPath[key] = value;
        });
        const metaByPath = {};
        metaByPathMap.forEach((value, key) => {
          metaByPath[key] = value;
        });
        const indexByPath = {};
        indexByPathMap.forEach((value, key) => {
          indexByPath[key] = value;
        });

        stats.leafComponents = leaves.length;
        stats.containers = labelByPathMap.size;



        return { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath };
      }

      function renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, rootInstance, invalidFields = new Set()) {

        const sortedLeaves = [...leaves].sort((a, b) => {
          const isPanelA = a.comp?.component?.type === 'panel' || a.comp?.type === 'panel';
          const isPanelB = b.comp?.component?.type === 'panel' || b.comp?.type === 'panel';
          const isWellA = a.comp?.component?.type === 'well' || a.comp?.type === 'well';
          const isWellB = b.comp?.component?.type === 'well' || b.comp?.type === 'well';

          const isFlattenedA = shouldFlattenContainer([a.comp?.type, a.comp?.component?.type]);
          const isFlattenedB = shouldFlattenContainer([b.comp?.type, b.comp?.component?.type]);

          const isContainerA = (isPanelA || isWellA) && !isFlattenedA;
          const isContainerB = (isPanelB || isWellB) && !isFlattenedB;

          if (isContainerA && !isContainerB) {
            return -1; // Container comes first
          }
          if (!isContainerA && isContainerB) {
            return 1; // Container comes first
          }

          const isTagpadA = a.comp?.component?.type === 'tagpad' || a.comp?.type === 'tagpad' ||
            a.path?.includes('tagpad') || a.label?.startsWith('Tag ');
          const isTagpadB = b.comp?.component?.type === 'tagpad' || b.comp?.type === 'tagpad' ||
            b.path?.includes('tagpad') || b.label?.startsWith('Tag ');

          if (isTagpadA && !isTagpadB) {
            return a.formIndex >= 0 ? -1 : 0;
          }
          if (!isTagpadA && isTagpadB) {
            return b.formIndex >= 0 ? 1 : 0;
          }

          if (a.formIndex >= 0 && b.formIndex >= 0) {
            return a.formIndex - b.formIndex;
          }
          if (a.formIndex >= 0) return -1;
          if (b.formIndex >= 0) return 1;

          if (a.path && b.path) {
            const aDepth = (a.path.match(/\./g) || []).length;
            const bDepth = (b.path.match(/\./g) || []).length;

            if (aDepth !== bDepth) {
              return aDepth - bDepth; // Shorter paths (parent components) come first
            }

            return a.path.localeCompare(b.path);
          }

          return 0;
        });

        const root = {};
        const ensureNode = (obj, k, compRef) => {
          if (obj == null) {
            return {
              __children: {}, __rows: {}, __label: null, __suppress: false,
              __kind: null, __colKeys: null, __colLabels: null,
              __formIndex: -1,
              __comp: compRef || undefined
            };
          }
          if (typeof k !== 'string' && typeof k !== 'number') {
            k = String(k || 'unknown');
          }
          if (!obj[k]) {
            obj[k] = {
              __children: {}, __rows: {}, __label: null, __suppress: false,
              __kind: null, __colKeys: null, __colLabels: null,
              __formIndex: -1,
              __comp: compRef || undefined
            };
          } else if (compRef && !obj[k].__comp) {
            obj[k].__comp = compRef;
          }
          return obj[k];
        };

        function setNodeLabelForPath(node, containerPath) {
          if (!node.__label && labelByPath && typeof labelByPath === 'object' && containerPath in labelByPath) {
            node.__label = labelByPath[containerPath];
          }
        }

        function setNodeMetaForPath(node, containerPath) {
          const m = metaByPath && metaByPath[containerPath];
          if (containerPath.includes('editGrid') || containerPath.includes('dataGrid') || containerPath.includes('dataTable')) {
          }
          if (m) {
            if (!node.__kind) {
              node.__kind = m.kind;
            }
            if (m.kind === 'editgrid' || m.kind === 'datagrid' || m.kind === 'datatable') {
              node.__colKeys = m.columnKeys || [];
              node.__colLabels = m.columnLabels || [];
            }
          }
        }

        function setNodeIndexForPath(node, containerPath) {
          if (indexByPath && typeof indexByPath === 'object' && containerPath in indexByPath) {
            node.__formIndex = indexByPath[containerPath];
          }
        }

        function isFieldInvalid(comp, path) {
          if (!invalidFields || invalidFields.size === 0) return false;

          const fieldPath = path || comp?.path || comp?.key || comp?.component?.key;

          if (invalidFields.has(fieldPath)) {
            return true;
          }

          if (fieldPath) {
            if (!fieldPath.startsWith('form.')) {
              const nestedPath = `form.data.${fieldPath}`;
              if (invalidFields.has(nestedPath)) {
                return true;
              }

              const altNestedPath = `data.${fieldPath}`;
              if (invalidFields.has(altNestedPath)) {
                return true;
              }
            }

            if (fieldPath.startsWith('form.data.')) {
              const simplifiedPath = fieldPath.replace('form.data.', '');
              if (invalidFields.has(simplifiedPath)) {
                return true;
              }
            }

            const fieldName = fieldPath.split('.').pop();
            for (const invalidField of invalidFields) {
              if (invalidField.endsWith('.' + fieldName) || invalidField === fieldName) {
                return true;
              }
              
              if (invalidField.includes('[') && invalidField.includes(']')) {
                const invalidFieldName = invalidField.split('.').pop();
                if (invalidFieldName === fieldName || invalidFieldName === fieldPath) {
                  return true;
                }
              }
            }
          }

          return false;
        }

         const getInvalidStyle = (comp, path, basePath = '') => {
           const pathsToTry = [];

           if (basePath) {
             pathsToTry.push(`${basePath}.${path}`); // basePath.path
             pathsToTry.push(`${basePath}[${path}]`); // basePath[path] for array access

             pathsToTry.push(`form.data.${basePath}.${path}`);
             pathsToTry.push(`form.${basePath}.${path}`);

             pathsToTry.push(`data.${basePath}.${path}`);
           }

           pathsToTry.push(path); // just the path itself

           if (!path.includes('.')) {
             pathsToTry.push(`form.data.${path}`);
             pathsToTry.push(`data.${path}`);
           }

           const componentType = comp?.type || comp?.component?.type;
           if (componentType === 'file') {
             console.log(`🎨 Styling file component "${path}" (basePath: "${basePath}"):`, {
               pathsToTry,
               invalidFields: Array.from(invalidFields),
               comp: comp
             });
           }

           for (const testPath of pathsToTry) {
             if (isFieldInvalid(comp, testPath)) {
               return 'background-color:rgb(255 123 123); border-radius: 3px;';
             }
           }

           return '';
         };

        const isRowInvalidRecursive = (node, currentPath) => {
          if (node.__comp && isFieldInvalid(node.__comp, currentPath)) {
            return true;
          }

          if (node.__children) {
            return Object.keys(node.__children).some(childKey => {
              const childNode = node.__children[childKey];
              const childPath = `${currentPath}.${childKey}`;
              return isRowInvalidRecursive(childNode, childPath);
            });
          }

          return false;
        };

        const isRowInvalid = (row, datagridKey, rowIdx) => {
          if (!row.__children) return false;

          const hasDirectInvalid = Object.keys(row.__children).some(colKey => {
            const cell = row.__children[colKey];
            const cellPath = `${datagridKey}[${rowIdx}].${colKey}`;
            return isFieldInvalid(cell.__comp, cellPath);
          });

          if (hasDirectInvalid) return true;

          return Object.keys(row.__children).some(colKey => {
            const cell = row.__children[colKey];
            const cellPath = `${datagridKey}[${rowIdx}].${colKey}`;
            return isRowInvalidRecursive(cell, cellPath);
          });
        };

        const isDatagridInvalid = (rows, datagridKey) => {
          if (!rows) return false;
          return Object.keys(rows).some(rowIdx => {
            const row = rows[rowIdx];
            return isRowInvalid(row, datagridKey, parseInt(rowIdx));
          });
        };

        const isContainerInvalid = (containerNode, containerKey, containerBasePath) => {
          if (!containerNode) return false;

          const containerPath = containerBasePath ? `${containerBasePath}.${containerKey}` : containerKey;
          if (containerNode.__comp && isFieldInvalid(containerNode.__comp, containerPath)) {
            return true;
          }

          if (containerNode.__children) {
            return Object.keys(containerNode.__children).some(childKey => {
              const childNode = containerNode.__children[childKey];
              const childPath = `${containerPath}.${childKey}`;
              
              if (childNode.__leaf) {
                return childNode.__comp && isFieldInvalid(childNode.__comp, childPath);
              }
              
              return isContainerInvalid(childNode, childKey, containerPath);
            });
          }

          if (containerNode.__rows) {
            return Object.keys(containerNode.__rows).some(rowIdx => {
              const row = containerNode.__rows[rowIdx];
              return isRowInvalid(row, containerKey, parseInt(rowIdx));
            });
          }

          return false;
        };

        function formatValue(value, comp) {
          if (value && (value._type === 'table' || value._type === 'datatable') && (Array.isArray(comp.table) || Array.isArray(comp.dataValue) || Array.isArray(comp.rows))) {
            console.log('formatValue', value, comp);
            const customTableForReview = (component, data = {}) => {
              console.log('customTableForReview', component, data);
              var label = component.label;
              var key = component.key;
              var customTable = null;
              var customPanel = null;
              var customColumn = null;
              var rowData = [];
              var value = {};
              var column = [];
              var finalTable = [];
              
              // Handle both regular tables and data tables
              var rows = component.table || component.components || component.columns;
              var dataRows = [];
              
              // For data tables, get the actual data
              if (component._type === 'datatable' || component.type === 'datatable') {
                dataRows = Array.isArray(component.dataValue) ? component.dataValue :
                          Array.isArray(component.rows) ? component.rows :
                          Array.isArray(component.data) ? component.data :
                          Array.isArray(data[key]) ? data[key] : [];
                          
                // If we have data but no column definitions, create them from data keys
                if (dataRows.length > 0 && (!rows || rows.length === 0)) {
                  const firstRow = dataRows[0];
                  if (typeof firstRow === 'object') {
                    rows = Object.keys(firstRow).map(k => ({ component: { key: k, label: k, type: 'textfield' } }));
                  }
                }
              }
              
              // First, collect all the original data structure
              var originalRows = [];
              
              // Handle data tables differently from regular tables
              if (component._type === 'datatable' || component.type === 'datatable') {
                console.log('dataTables', dataRows, rows);
                // For data tables, use traditional table layout: columns=fields, rows=data records
                // Don't transpose - just create the structure directly
                customTable = [];
                
                // Use the order from dataRows keys, not from rows configuration
                const dataRowKeys = dataRows.length > 0 ? Object.keys(dataRows[0]) : [];
                
                // Create column definitions based on dataRowKeys order
                const orderedColumns = dataRowKeys.map(key => {
                  // Find the corresponding component definition
                  const colDef = rows.find(col => {
                    const fieldComp = col.component || col;
                    return fieldComp.key === key;
                  });
                  
                  if (colDef) {
                    const fieldComp = colDef.component || colDef;
                    return {
                      key: key,
                      label: fieldComp.label || fieldComp.key || key,
                      type: fieldComp.type || 'textfield'
                    };
                  } else {
                    // Fallback if no component definition found
                    return {
                      key: key,
                      label: key,
                      type: 'textfield'
                    };
                  }
                });
                
                const columnLabels = orderedColumns.map(col => col.label);
                
                // Create each data row using ordered columns
                dataRows.forEach((rowDataObj, rowIndex) => {
                  rowData = [];
                  if (orderedColumns && Array.isArray(orderedColumns)) {
                    orderedColumns.forEach(col => {
                      const colKey = col.key;
                      const cellValue = typeof rowDataObj === 'object' ? rowDataObj[colKey] : '';
                      
                      value = {};
                      value._label = col.label;
                      value._key = colKey;
                      value._type = col.type;
                      value._leaf = true;
                      value._value = cellValue;
                      column = [{ _children: value }];
                      rowData.push({ _row: column });
                    });
                  }
                  if (rowData.length > 0) {
                    customTable.push({ _row: rowData });
                  }
                });
                
                // Store column labels for header generation
                finalTable = {
                  _label: label,
                  _key: key,
                  _row: customTable,
                  _columnLabels: columnLabels,
                  _isDataTable: true
                };
                
                return finalTable;
              } else {
                // Regular table processing
                [...rows].reverse().map((row) => {
                  if (Array.isArray(row)) {
                    rowData = [];
                    [...row].reverse().map((col) => {
                      column = [];
                      if (col && col.length > 0) {
                        col.map(field => {
                          const fieldComp = field.component
                          value = {};
                          value._label = fieldComp.label;
                          value._key = fieldComp.key;
                          value._type = fieldComp.type;
                          value._leaf = true;
                          value._value = data[fieldComp.key];
                          column.push({ _children: value });
                        });
                      }
                      if (column.length > 0) {
                        rowData.push({ _row: column });
                      }
                      else{
                        rowData.push({  });
                      }
                    });
                    if (rowData.length > 0) {
                      originalRows.push({ _row: rowData });
                    }
                  }
                });
              }
              
              // Now transpose: turn rows into columns
              if (originalRows.length > 0) {
                customTable = [];
                const maxColumns = Math.max(...originalRows.map(row => row._row ? row._row.length : 0));
                
                // For each original column index, create a new row
                for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
                  const newRowData = [];
                  
                  // For each original row, take the cell at colIndex and make it a column in the new row
                  originalRows.forEach((originalRow) => {
                    if (originalRow._row && originalRow._row[colIndex]) {
                      newRowData.push(originalRow._row[colIndex]);
                    } else {
                      newRowData.push({  }); // Empty cell
                    }
                  });
                  
                  customTable.push({ _row: newRowData });
                }
              }

              
              
              finalTable = {
                _label: label,
                _key: key,
                _row: customTable || customPanel || customColumn
              };
              return finalTable;
            };
            const customTable = customTableForReview(comp, comp.data || {});
            let tableHtml = '';
            tableHtml += `<table style="width:100%;border-collapse:collapse;">`;
            console.log('customTable', customTable, comp);
            // Handle data tables with headers
            if (customTable._isDataTable && customTable._columnLabels) {
              // Add header row for data tables
              tableHtml += `<thead style="background-color:#f8f9fa;">`;
              tableHtml += `<tr>`;
              customTable._columnLabels.forEach(label => {
                tableHtml += `<th style="border:1px solid #ccc;padding:8px;text-align:left;font-weight:bold;">${label}</th>`;
              });
              tableHtml += `</tr>`;
              tableHtml += `</thead>`;
              
              // Add data rows
              tableHtml += `<tbody>`;
              customTable._row.forEach(rowObj => {
                tableHtml += `<tr>`;
                if (Array.isArray(rowObj._row)) {
                  rowObj._row.forEach(colObj => {
                    if (Array.isArray(colObj._row)) {
                      tableHtml += `<td style="border:1px solid #ccc;padding:8px;">`;
                      colObj._row.forEach(cellObj => {
                        if (cellObj._children) {
                          const formattedValue = formatValue(cellObj._children._value, cellObj._children._comp);
                          if (cellObj && cellObj._children && cellObj._children._type && cellObj._children._type === 'textarea') {
                            const textareaContent = formattedValue.replace(/__TEXTAREA__/g, '');
                            tableHtml += `${textareaContent}`;
                          } else {
                            tableHtml += `${formattedValue ?? ''}`;
                          }
                        }
                      });
                      tableHtml += `</td>`;
                    } else{
                      tableHtml += `<td style="border:1px solid #ccc;padding:8px;"></td>`;
                    }
                  });
                } 
                tableHtml += `</tr>`;
              });
              tableHtml += `</tbody>`;
            } else {
              // Regular table processing (transposed with field labels)
              customTable._row.forEach(rowObj => {
                tableHtml += `<tr>`;
                if (Array.isArray(rowObj._row)) {
                  rowObj._row.forEach(colObj => {
                    if (Array.isArray(colObj._row)) {
                      tableHtml += `<td style="border:1px solid #ccc;padding:4px;">`;
                      colObj._row.forEach(cellObj => {
                        if (cellObj._children) {
                          const formattedValue = formatValue(cellObj._children._value, cellObj._children._comp);
                          if (cellObj && cellObj._children && cellObj._children._type && cellObj._children._type === 'textarea') {
                            const textareaContent = formattedValue.replace(/__TEXTAREA__/g, '');
                            tableHtml += `<div style="display: flex; align-items: flex-start;"><strong>${cellObj._children._label}:</strong>${textareaContent}</div>`;
                          } else {
                            tableHtml += `<strong>${cellObj._children._label}:</strong> ${formattedValue ?? ''}`;
                          }
                        }
                        if(colObj._row.length > 1){
                          tableHtml += `<br/>`;
                        }
                      });
                      tableHtml += `</td>`;
                    } else{
                      tableHtml += `<td style="border:1px solid #ccc;padding:4px;"></td>`;
                    }
                  });
                } 
                tableHtml += `</tr>`;
              });
            }
            
            tableHtml += `</table>`;
            return tableHtml;
          }

          if (comp?.type === 'textarea' || comp?.component?.type === 'textarea' || (value && typeof value === 'string' && value.includes('\n')))  {
            if (value === null || value === undefined || value === '') return '';
            const formattedValue = String(value).replace(/\n/g, '<br/>'); // Preserve line breaks
            return `__TEXTAREA__${formattedValue}__TEXTAREA__`;
          }

          if (comp?.type === 'survey' || comp?.component?.type === 'survey') {
            let surveyHTML = '<div idx="7" style="padding-left: 10px;">';
            const padStyle = typeof pad !== 'undefined' ? pad : '';
            const depthLevel = typeof depth !== 'undefined' ? depth : 0;
            comp.component.questions.forEach((question, index) => {
              if (value[question.value]) {
                surveyHTML += `<div idx="8" style="${padStyle}padding-left: 10px; border-left:1px dotted #ccc;">
                                <strong>${question.label}:</strong> ${String(comp.component?.values[index].label)}
                              </div>`;
              } else {
                surveyHTML += `<div idx="9" style="${padStyle}padding-left: 10px; border-left:1px dotted #ccc;">
                                <strong>${question.label}:</strong>
                              </div>`;
              }
            });
            surveyHTML += `</div>`;
            return surveyHTML;
          }

          if (value && value._type && (value._type === 'panel' || value._type === 'well' ||
            value._type === 'container' || value._type === 'fieldset' || value._type === 'columns')) {
            
            return `(${value._type} data)`;
          }
          if (value && value._label && typeof value._row === 'object') {
            return `(${value._type || 'Container'} data)`;
          }

          if (comp?.type === 'form' || comp?.component?.type === 'form') {
            return '(Form data)';
          }

          const isFileComponent = comp?.component?.type === 'file' 

          if (comp?.component?.type === 'signature') {
            return value ? 'Signed' : 'Not Signed';
          }

          if (comp?.type === 'tagpad' || (comp?.parent?.type === 'tagpad' && comp?.parent?.component?.type === 'tagpad')) {
            if (typeof value !== 'object' || value === null) {
              return value ?? '';
            }
            try {
              if (Array.isArray(value)) {
                return value.join(', ');
              } else if (typeof value === 'object') {
                return String(value?.value || value?.data || value?.text ||
                  Object.values(value)[0] || JSON.stringify(value));
              }
            } catch (e) {
              console.warn('Error formatting tagpad value:', e);
            }
            return String(value);
          }

          if (comp?.component?.type === 'selectboxes') {
            if (value && typeof value === 'object' && Object.values(value).some(v => typeof v === 'boolean')) {
              const selected = Object.keys(value).filter(k => value[k] === true);
              return selected.join(', ');
            }
          }

          if (Array.isArray(value)) {
            if (isFileComponent && value.length && typeof value[0] === 'object') {
              const names = value.map(v => v?.originalName || v?.name || v?.fileName || v?.path || '[file]');
              return names.join(', ');
            }
            return value.join(', ');
          }

          if (value && typeof value === 'object') {
            if (isFileComponent) return value.originalName || value.name || value.fileName || '[file]';
            try { return JSON.stringify(value); } catch { return String(value); }
          }

          if (comp?.type === 'currency' || comp?.component?.type === 'currency') {
            if (value === null || value === undefined || value === '') return '';
            const numValue = typeof value === 'number' ? value : parseFloat(value);
            if (isNaN(numValue)) return value ?? '';
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(numValue);
          }

          if (comp?.type === 'password' || comp?.component?.type === 'password') {
            if (value === null || value === undefined || value === '') return '';
            const passwordLength = String(value).length;
            return '•'.repeat(passwordLength); // Show one dot per character
          }

          if (comp?.type === 'datetime' || comp?.component?.type === 'datetime' || 
              comp?.type === 'date' || comp?.component?.type === 'date' ||
              comp?.type === 'time' || comp?.component?.type === 'time') {
            if (value === null || value === undefined || value === '') return '';
            
            try {
              let date;
              
              if (comp?.type === 'time' || comp?.component?.type === 'time') {
                if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
                  const today = new Date().toISOString().split('T')[0]; // Get today in YYYY-MM-DD format
                  date = new Date(`${today}T${value}`);
                } else {
                  date = new Date(value);
                }
              } else {
                date = new Date(value);
              }
              
              if (isNaN(date.getTime())) return value; // Return original value if not a valid date
              
              if (comp?.type === 'datetime' || comp?.component?.type === 'datetime') {
                return date.toLocaleString('en-US', {
                  month: '2-digit',
                  day: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                });
              } else if (comp?.type === 'date' || comp?.component?.type === 'date') {
                return date.toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                  year: 'numeric'
                });
              } else if (comp?.type === 'time' || comp?.component?.type === 'time') {
                return date.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                });
              }
            } catch (e) {
              console.warn('Error formatting date/time value:', e);
              return value; // Return original value if formatting fails
            }
          }

          if (value === false) return 'No';
          if (value === true) return 'Yes';
          return value ?? '';
        }

        function firstLeafVal(n) {
          if (!n) return '';
          if (n.__leaf) return formatValue(n.__value, n.__comp);
          for (const [, child] of Object.entries(n.__children || {})) {
            const v = firstLeafVal(child);
            if (v !== '') return v;
          }
          return '';
        }

        const processedTreePaths = new Set();



        const isParentComponent = (comp) => {
          return isContainerType([comp?.type, comp?.component?.type], ['table']) &&
                 !shouldFlattenContainer([comp?.type, comp?.component?.type])
        };

        const panelPaths = new Set();
        for (const { path, comp } of sortedLeaves) {
          if (isParentComponent(comp)) {
            const normalizedPath = path.replace(/\.data\./g, '.')
              .replace(/^data\./, '')
              .replace(/^form\./, '')
              .replace(/^submission\./, '');
            panelPaths.add(normalizedPath);
          }
        }

        for (const { path, label, value, comp, formIndex } of sortedLeaves) {
          const normalizedPath = path.replace(/\.data\./g, '.')
            .replace(/^data\./, '')
            .replace(/^form\./, '')
            .replace(/^submission\./, '');

          if (normalizedPath.includes('editGrid[')) {
          }

          if (processedTreePaths.has(normalizedPath)) {
            continue;
          }

          const isPanelComponent = isParentComponent(comp);
          if (isPanelComponent) {
            panelPaths.add(normalizedPath);
          }

          processedTreePaths.add(normalizedPath);

          let isChildOfPanel = false;
          let parentPanelPath = '';

          if (!isPanelComponent) {
            for (const panelPath of panelPaths) {
              if (normalizedPath !== panelPath &&
                normalizedPath.startsWith(panelPath + '.')) {
                isChildOfPanel = true;
                parentPanelPath = panelPath;
                break;
              }
            }
          }

          const parts = normalizedPath
            .split('.')
            .filter(Boolean)
            .filter(seg => !/^\d+$/.test(seg));
          
          let ptr = root;
          let containerPath = '';

          const isPanelAtRoot = parts.length === 1 && isParentComponent(comp);

          for (let i = 0; i < parts.length; i++) {
            const seg = parts[i];
            if (!seg) {
              console.warn('Empty segment found in path parts:', parts);
              continue;
            }

            const idxMatch = seg.match(/\[(\d+)\]/);
            const key = seg.replace(/\[\d+\]/g, '');


            if (!key) {
              console.warn('Empty key after processing segment:', seg);
              continue;
            }

            containerPath = containerPath ? `${containerPath}.${key}` : key;

            try {
              const node = ensureNode(ptr, key, comp);

              if (!node) {
                console.error('Failed to create node for key:', key);
                continue;
              }

              if (suppressLabelForKey.has(key)) node.__suppress = true;
              setNodeLabelForPath(node, containerPath);
              setNodeMetaForPath(node, containerPath);
              setNodeIndexForPath(node, containerPath);
              if (formIndex >= 0 && (node.__formIndex === -1 || formIndex < node.__formIndex)) {
                node.__formIndex = formIndex;
              }

              if (idxMatch) {
                const idx = Number(idxMatch[1]);
                if (!node.__rows) node.__rows = {};
                node.__rows[idx] ??= { __children: {}, __comp: comp };
                ptr = node.__rows[idx].__children;
              } else if (i === parts.length - 1) {
                const isWellComponent = comp?.component?.type === 'well' || comp?.type === 'well';

                if (isPanelComponent || isWellComponent) {
                  ptr[key] = {
                    __leaf: false,
                    __label: label || key,
                    __value: value,
                    __comp: comp,
                    __formIndex: formIndex,
                    __children: {},
                    __rows: {},
                    __suppress: false,
                    __kind: comp.type,
                    __colKeys: null,
                    __colLabels: null
                  };
                } else {
                  let labelData = label || key
                  if(comp?.parent?.type === 'datamap') {
                    labelData = key;
                  }
                  ptr[key] = {
                    __leaf: true,
                    __label: labelData,
                    __value: value,
                    __kind: comp.type,
                    __comp: comp,
                    __formIndex: formIndex
                  };
                }
              } else {
                if (!node.__children) node.__children = {};
                Object.keys(node.__children).forEach(childKey => {
                  if (node.__children[childKey] && !node.__children[childKey].__comp) {
                    node.__children[childKey].__comp = comp;
                  }
                });
                ptr = node.__children;
              }
              if ((comp?.component?.type === 'datamap' || comp?.parent.type === 'datamap')) {
                if(ptr && ptr[key] && ptr[key].__comp) {
                  ptr[key].__comp = comp;
                  if (ptr[key].__children && typeof ptr[key].__children === 'object') {
                    Object.keys(ptr[key].__children).forEach(childKey => {
                      if (ptr[key].__children[childKey] && !ptr[key].__children[childKey].__comp) {
                        ptr[key].__children[childKey].__comp = comp;
                      }
                    });
                  }
                }
              }
                
            } catch (error) {
              console.error('Error processing path segment:', {
                segment: seg,
                key,
                path: normalizedPath,
                error: error.message
              });
              continue;
            }
          }
        }

        const renderNode = (node, depth = 0, rootInstance = null, invalidFields = new Set(), basePath = '') => {
          let pad = `padding-left:10px; border-left:1px dotted #ccc;`;
          

          const sortedEntries = Object.entries(node).sort((a, b) => {
            const aIsTagpad = a[1]?.__label === 'Tagpad' || a[1]?.__comp?.component?.type === 'tagpad';
            const bIsTagpad = b[1]?.__label === 'Tagpad' || b[1]?.__comp?.component?.type === 'tagpad';

            if (aIsTagpad && bIsTagpad) {
              return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
            }

            if (aIsTagpad) return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? 0);
            if (bIsTagpad) return (a[1]?.__formIndex ?? 0) - (b[1]?.__formIndex ?? -1);

            return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
          });

          return sortedEntries.map(([k, v], index) => {
            const isAddressComponentRender = v.__comp?.component?.type === 'address' || v.__comp?.type === 'address';

            if (isAddressComponentRender) {
            }

            if (v.__comp?._visible == false || v.__comp?.type === 'datasource' ||
               (v.__comp?.component.reviewVisible == false && !v.__comp?.component.validate.required && !isAddressComponentRender)) {
              return '';
            }

            if (v.__comp?.parent?.type === 'datamap') {
              if (index === 0) {
                delete v.__comp;
              } else if (v?.__rows) {
                v.__children = {};
                Object.values(v.__rows).forEach(row => {
                  if (row?.__children) {
                    Object.entries(row.__children).forEach(([childKey, childVal]) => {
                      v.__children[childVal.__label] = childKey;
                    });
                  }
                });
                v.__rows = {};
              }
            }

            if (/^\d+\]$/.test(k) || v?.__comp == undefined) {
              return v && typeof v === 'object' ? renderNode(v.__children || {}, depth, rootInstance, invalidFields, basePath) : '';
            }

            if (v && v.__leaf) {
              const isFormComponent = v.__comp?.type === 'form' || v.__comp?.component?.type === 'form';

              const val = firstLeafVal(v);

              const isTagpadDot = (v.__comp?.type === 'tagpad') ||
                (v.__comp?.parent?.type === 'tagpad');

              if (isFormComponent) {
                const formValue = v.__value || {};
                let formContentHtml = '<div idx="10" depth="${depth}" style="padding-left: 10px;">';

                if (typeof formValue === 'object' && !Array.isArray(formValue)) {
                  
                  const contentItems = Object.entries(formValue)
                    .filter(([fieldKey, fieldVal]) => fieldVal !== null && fieldVal !== undefined)
                    .map(([fieldKey, fieldVal]) => {
                      const displayVal = typeof fieldVal === 'object'
                        ? JSON.stringify(fieldVal)
                        : String(fieldVal);
                      const fieldPath = `${k}.${fieldKey}`;
                      return `<div idx="2" depth="${depth}" style="margin-left:10px; ${pad};"><strong style="${getInvalidStyle(v.__comp, fieldPath)}">${fieldKey}:</strong> ${displayVal}</div>`;
                    })
                    .join('');
                  formContentHtml += contentItems;
                }

                formContentHtml += '</div>';

                return `
                  <div idx="1" style="${pad}"><strong style="${getInvalidStyle(v.__comp, k, basePath)}">${v.__label || k}:</strong></div>
                  ${formContentHtml || `<div idx="3" style="padding-left: 10px;"><div idx="4" style="${pad};">(No data)</div></div>`}
                `;
              } else if (isTagpadDot) {
                return `<div idx="5" depth="${depth}" style="${pad}"><strong style="${getInvalidStyle(v.__comp, k, basePath)}">${v.__label || k}:</strong> ${val}</div>`;
              } else if (val && typeof val === 'string' && val.includes('__TEXTAREA__')) {
                const textareaContent = val.replace(/__TEXTAREA__/g, '');
                return `<div idx="6" depth="${depth}" style="${pad} display: flex; align-items: flex-start;">
                          <strong style="${getInvalidStyle(v.__comp, k, basePath)}">${v.__label || k}:</strong>
                          ${textareaContent}
                        </div>`;
              } else{
                return `<div idx="6" depth="${depth}" style="${pad}"><strong style="${getInvalidStyle(v.__comp, k, basePath)}">${v.__label || k}:</strong> ${val}</div>`;
              }
            }

            if (v && typeof v === 'object') {
              if(!v.__label){
                const foundComponent = findComponentByKey(rootInstance, k);
                if (foundComponent) {
                  v.__label = foundComponent.component.component?.label || foundComponent.component.label || k;
                } else {
                  v.__label = k; // Fallback to key if not found
                }
              }

              const hasChildren = v.__children && Object.keys(v.__children).length;
              const hasRows = v.__rows && Object.keys(v.__rows).length;
              if (v.__comp?.component?.type === 'editgrid' || v.__comp?.type === 'editgrid') {
              }
              const isDataGridComponent = v.__kind === 'datagrid' || v.__kind === 'datatable' || v.__kind === 'editgrid';
              const isDataTableComponent = v.__comp?.component?.type === 'datatable' || v.__comp?.type === 'datatable';
              const isTableComponent = v.__comp?.component?.type === 'table' || v.__comp?.type === 'table';
              const isContainerComponent = 
                  !isDataGridComponent && !isDataTableComponent && !isTableComponent && // Don't treat data grids/tables as containers
                  ((isContainerType([v.__comp?.component?.type, v.__comp?.type, v.__value?._type]) ) || 
                  Array.isArray(v.__value?._row));
              

              const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k + " - missing __label") );
              
              
              let headerStyle = ""
              const header = `<div idx="12" style="${headerStyle}">`;

              // Handle data tables and tables specifically
              if (isDataTableComponent && v.__comp) {
                const comp = v.__comp;
                const mockValue = { _type: 'datatable' };
                const tableHtml = formatValue(mockValue, comp);
                
                return `${header}<div style="margin-bottom:10px;"><strong>${displayLabel}</strong></div>${tableHtml}</div>`;
              }

              if (isTableComponent && v.__comp) {
                const comp = v.__comp;
                const mockValue = { _type: 'table' };
                const tableHtml = formatValue(mockValue, comp);
                
                return `${header}<div style="margin-bottom:10px;"><strong>${displayLabel}</strong></div>${tableHtml}</div>`;
              }

              if (isContainerComponent) {
                let panelChildrenHtml = '';

                if (hasChildren) {
                  const containerPath = basePath ? `${basePath}.${k}` : k;
                  panelChildrenHtml = renderNode(v.__children, depth + 1, rootInstance, invalidFields, containerPath);
                }
                else if (v.__comp && Array.isArray(v.__comp.components) && v.__comp.components.length > 0) {
                  const artificialChildren = {};
                  v.__comp.components.forEach((comp, index) => {
                    if (comp && comp.key) {
                      artificialChildren[comp.key] = {
                        __label: comp.label || comp.key,
                        __comp: comp,
                        __leaf: !comp.components || comp.components.length === 0,
                        __value: comp.defaultValue || '',
                        __children: comp.components && comp.components.length > 0 ? 
                          comp.components.reduce((acc, child, idx) => {
                            if (child && child.key) {
                              acc[child.key] = {
                                __label: child.label || child.key,
                                __comp: child,
                                __leaf: !child.components || child.components.length === 0,
                                __value: child.defaultValue || ''
                              };
                            }
                            return acc;
                          }, {}) : {}
                      };
                    }
                  });
                  
                  const containerPath = basePath ? `${basePath}.${k}` : k;
                   
                   if (v?.__comp?.editRows && Array.isArray(v.__comp.editRows)) {
                     const transformedEditRows = {};
                     
                     v.__comp.editRows.forEach((row, rowIdx) => {
                       const rowKey = `Row ${rowIdx + 1}`;
                       transformedEditRows[rowKey] = {
                         __children: {},
                         __comp: v.__comp
                       };
                       
                       if (row.components && Array.isArray(row.components)) {
                         row.components.forEach(comp => {
                           const compKey = comp.key || comp.component?.key || 'unknown';
                           const compValue = row.data && row.data[compKey] ? row.data[compKey] : (comp.getValue ? comp.getValue() : comp.dataValue);
                           const compLabel = comp.component?.label || comp.label || compKey;
                           
                           transformedEditRows[rowKey].__children[compKey] = {
                             __leaf: true,
                             __label: compLabel,
                             __value: compValue,
                             __comp: comp,
                             __children: {},
                             __rows: {}
                           };
                         });
                       }
                     });
                     
                     panelChildrenHtml = renderNode(transformedEditRows, depth + 1, rootInstance, invalidFields, containerPath);
                   } else {
                     panelChildrenHtml = renderNode(artificialChildren, depth + 1, rootInstance, invalidFields, containerPath);
                   }
                }

                const customStructure = v.__value && v.__value._type && v.__value._row;
                if (customStructure) {
                  const containerType = v.__value._type;
                  const containerLabel = v.__value._label || displayLabel || containerType;
                  let customChildrenHtml = '';

                  if (Array.isArray(v.__value._row)) {
                    customChildrenHtml = v.__value._row.map(item => {
                      if (item._children) {
                        const childLabel = item._children._label || '';
                        const childValue = item._children._value || '';
                        const childPath = item._children._key || childLabel;
                        return `<div idx="13" style="${pad}"><strong style="${getInvalidStyle(item._children, childPath)}">${childLabel}:</strong> ${childValue}</div>`;
                      } else if (item._row && Array.isArray(item._row)) {
                        return item._row.map(cell => {
                          if (cell._children) {
                            const cellLabel = cell._children._label || '';
                            const cellValue = cell._children._value || '';
                            const cellPath = cell._children._key || cellLabel;
                            return `<div idx="14" style="${pad}"><strong style="${getInvalidStyle(cell._children, cellPath)}">${cellLabel}:</strong> ${cellValue}</div>`;
                          }
                          return '';
                        }).join('');
                      }
                      return '';
                    }).join('');
                  }

                  return `
                    <div idx="15" style="padding-left:10px; margin-left:0px; border-left:1px dotted #ccc;">
                      <strong style="${getInvalidStyle(v.__comp, k, basePath)}">${containerLabel}</strong>
                      <div idx="16" style="padding-left: 10px;">
                        ${customChildrenHtml || panelChildrenHtml}
                      </div>
                    </div>
                  `;
                } else {
                  if(depth >= 1) {
                    pad += `margin-left: 10px;`;
                  }
                  return `
                    <div idx="17" style="${pad}">
                      ${panelChildrenHtml}
                    </div>
                  `;
                }
              }
              else{
                headerStyle += "border-left:1px dotted #ccc;"
              }

              const conditionMet = (v.__kind === 'datagrid' || v.__kind === 'datatable' || v.__kind === 'editgrid') && hasRows;
              if (v.__kind === 'datagrid' || v.__kind === 'datatable') {
              }
              
              if (conditionMet) {
                const presentKeys = new Set();
                Object.values(v.__rows).forEach(r => {
                  Object.keys(r.__children || {}).forEach(cKey => presentKeys.add(cKey));
                });

                const orderedKeys = Array.isArray(v.__colKeys) && v.__colKeys.length
                  ? v.__colKeys.filter(cKey => presentKeys.has(cKey))
                  : Array.from(presentKeys);

                const labelByKey = new Map(
                  (v.__colKeys || []).map((cKey, i) => [cKey, (v.__colLabels || [])[i] || cKey])
                ); const rowIdxs = Object.keys(v.__rows).map(n => Number(n)).sort((a, b) => a - b);
                let rowsHtml = '';
                const rowsItems = rowIdxs.map((rowIdx) => {
                  const row = v.__rows[rowIdx];
                  const haveMultiCols = orderedKeys.length > 1;
                  const rowHasErrors = isRowInvalid(row, k, rowIdx);
                  const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

                  const padRow = `padding-left:10px; border-left:1px dotted #ccc;`;
                  const padCol = `padding-left:10px; border-left:1px dotted #ccc;`;

                  if (haveMultiCols) {
                    const processedInThisRow = new Set();

                    let colsHtml = '<div idx="19" style="padding-left: 10px;">';
                    const colsItems = orderedKeys.map((colKey, colIdx) => {
                      if (processedInThisRow.has(colKey)) {
                        return '';
                      }

                      processedInThisRow.add(colKey);
                      const cell = row.__children[colKey];
                      let cellContent = '';

                      if (cell.__leaf || (v?.__rows && v?.__rows?.length > 0)) {
                        const val = firstLeafVal(cell);
                        const cellPath = `${k}[${rowIdx}].${colKey}`;
                        if (val && typeof val === 'string' && val.includes('__TEXTAREA__')) {
                          const textareaContent = val.replace(/__TEXTAREA__/g, '');
                          cellContent = `<div idx="20" style="${padCol}">
                                          <strong style="${getInvalidStyle(cell.__comp, colKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong><br/>
                                          ${textareaContent}
                                        </div>`;
                        } else {
                          cellContent = `<div idx="21" style="${padCol}"><strong style="${getInvalidStyle(cell.__comp, colKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${val}</div>`;
                        }
                      } else {
                        const hasChildren = cell?.__children && Object.keys(cell.__children).length > 0;
                        let nestedHtml = '';
                        
                        if (hasChildren) {
                          nestedHtml = renderNode(cell.__children, depth + 1, rootInstance, invalidFields, `${k}[${rowIdx}].${colKey}`);
                        }
                        
                        const hasNestedContent = nestedHtml && nestedHtml.trim().length > 0;
                        
                        const directVal = cell?.__value !== undefined ? formatValue(cell.__value, cell.__comp) : firstLeafVal(cell);
                        
                        if (hasNestedContent) {
                          cellContent = `<div idx="23" style="${padCol}"><strong>${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>${nestedHtml}`;
                        } else if (directVal) {
                          cellContent = `<div idx="22" style="${padCol}"><strong style="${getInvalidStyle(cell.__comp, colKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${directVal}</div>`;
                        } else {
                          cellContent = `<div idx="24" style="${padCol}"><strong>${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>`;
                        }
                      }
                      return `${cellContent}`;
                    }).filter(html => html.length > 0).join('');
                    colsHtml += colsItems;
                    colsHtml += '</div>';

                    return `<li style="margin-left:15 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${colsHtml}</li>`;
                  } else {
                    const onlyKey = orderedKeys[0];
                    const cell = row.__children[onlyKey];
                    const val = cell?.__leaf ? firstLeafVal(cell) : null;
                    const inner = cell?.__leaf
                      ? (val && typeof val === 'string' && val.includes('__TEXTAREA__'))
                        ? (() => {
                            const textareaContent = val.replace(/__TEXTAREA__/g, '');
                            return `<div idx="21" style="${padRow}">
                                     <strong style="${getInvalidStyle(cell.__comp, onlyKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong><br/>
                                     ${textareaContent}
                                   </div>`;
                          })()
                        : `<div idx="21" style="${padRow}"><strong style="${getInvalidStyle(cell.__comp, onlyKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong> ${val}</div>`
                      : renderNode(cell?.__children || {}, depth + 1, rootInstance, invalidFields, `${k}[${rowIdx}].${onlyKey}`);
                    return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${inner}</li>`;
                  }
                }).join('');
                rowsHtml += rowsItems;

                return `${header}<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${rowsHtml}</ul></div>`;
              }

              const childrenHtml = [
                hasRows
                  ? `<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${(() => {
                    return Object.entries(v.__rows).map(([i, r]) => {
                      const isTagpad = k === 'tagpad' ||
                        v.__label === 'Tagpad' ||
                        v.__comp?.component?.type === 'tagpad' ||
                        v.__comp?.type === 'tagpad';
                      const rowLabel = isTagpad ? `Tag ${Number(i) + 1}` : `Row ${Number(i) + 1}`;

                    const rowHasErrors = isRowInvalid(r, k, parseInt(i));
                    const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

                    const hasChildren = r.__children && Object.keys(r.__children).length > 0;
                    const content = hasChildren
                      ? renderNode(r.__children, depth + 1, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`)
                      : ``;

                    const rowClass = isTagpad ? 'tagpad-row' : 'data-row';

                      return `<li class="${rowClass}" style="margin-left:0 !important; padding-left: 0 !important;"><strong style="${rowLabelStyle}">${rowLabel}:</strong>${content}</li>`;
                    }).join('');
                  })()}</ul>` : '',
                hasChildren ? renderNode(v.__children, depth + 1, rootInstance, invalidFields, basePath ? `${basePath}.${k}` : k) : ''
              ].join('');
              return `${header}${childrenHtml}</div>`;
            }
            return '';
          }).join('');
        };
        return renderNode(root, 0, rootInstance, invalidFields, '');
      }


      const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } =
        await collectReviewLeavesAndLabels(this.root);

      const invalidFields = new Set();
      const validation = await this.validateFormExternal({
        showErrors: false, // Don't show errors yet, just collect them
        scrollToError: false
      });
      if (validation && validation.invalidComponents) {
        validation.invalidComponents.forEach(invalidComp => {
          const path = invalidComp.path || invalidComp.component?.path || invalidComp.component?.key;
          if (path) {
            invalidFields.add(path);
          }
        });
      }

      const isVisibleFormField = (component) => {
        if (!component) return false;
        
        if (component._visible === false) return false;
        if (component.visible === false) return false;
        if (component.disabled === true) return false;
        if (component.component?.hidden === true) return false;
        
        const containerTypes = ['panel', 'fieldset', 'datagrid', 'datatable', 'container', 'well', 'table', 'tabs', 'columns', 'htmlelement', 'content'];
        const componentType = component.type || component.component?.type || '';
        if (containerTypes.includes(componentType.toLowerCase())) return false;
        
        if (componentType === 'button') return false;
        
        const nonInputTypes = ['htmlelement', 'content', 'panel', 'fieldset', 'well', 'table', 'tabs', 'columns'];
        if (nonInputTypes.includes(componentType.toLowerCase())) return false;
        
        return true;
      };

      const generateUniqueComponentId = (component, parentId = '', childIndex = 0) => {
        if (!component) return null;
        
        const componentRef = component.toString ? component.toString().slice(-8) : Math.random().toString(36).substr(2, 8);
        const key = component.key || component.component?.key || 'unnamed';
        const type = component.type || component.component?.type || 'unknown';
        
        const uniqueId = parentId 
          ? `${parentId}:${childIndex}:${type}:${key}:${componentRef}`
          : `root:${childIndex}:${type}:${key}:${componentRef}`;
          
        return uniqueId;
      };

      const uniqueInvalidComponents = new Set();
      const uniqueIdToPathMap = new Map();

      const collectComponentErrors = (component, parentId = '', childIndex = 0, currentPath = '') => {
        if (!component) return;

        if (component._visible === false || component.visible === false || 
            component.disabled === true || component.component?.hidden === true) {
          return;
        }

        const uniqueId = generateUniqueComponentId(component, parentId, childIndex);
        const componentPath = currentPath || component.path || component.key || component.component?.key;

        if (uniqueId && componentPath) {
          uniqueIdToPathMap.set(uniqueId, componentPath);
        }

         if (isVisibleFormField(component) && component.checkValidity) {
           if (uniqueId && !isContainerType(component.type)) {
             let isActuallyInvalid = false;
             
             const componentType = component.type || component.component?.type;
             
             if (componentType === 'file') {
               const hasErrors = component.errors && component.errors.length > 0;
               const hasCheckValidity = component.checkValidity && !component.checkValidity();
               const isRequired = component.component?.validate?.required || component.validate?.required;
               
               let hasValue = false;
               
               const dataValue = component.dataValue;
               const componentData = component.data;
               const getValue = component.getValue && component.getValue();
               const getValueAsString = component.getValueAsString && component.getValueAsString();
               const nestedData = component.component?.data;
               const privateData = component._data;
               
               const rootData = this.root?.data;
               const submissionData = this.root?.submission?.data;
               const componentKey = component.key || component.component?.key;
               const rootComponentData = rootData && componentKey ? rootData[componentKey] : null;
               const submissionComponentData = submissionData && componentKey ? submissionData[componentKey] : null;
               
               let nestedPathData = null;
               if (componentPath && rootData) {
                 const pathParts = componentPath.split('.');
                 let currentData = rootData;
                 for (const part of pathParts) {
                   if (currentData && typeof currentData === 'object' && part in currentData) {
                     currentData = currentData[part];
                   } else {
                     currentData = null;
                     break;
                   }
                 }
                 nestedPathData = currentData;
               }
               
               let nestedSubmissionPathData = null;
               if (componentPath && submissionData) {
                 const pathParts = componentPath.split('.');
                 let currentData = submissionData;
                 for (const part of pathParts) {
                   if (currentData && typeof currentData === 'object' && part in currentData) {
                     currentData = currentData[part];
                   } else {
                     currentData = null;
                     break;
                   }
                 }
                 nestedSubmissionPathData = currentData;
               }
               
               const hasActualFileData = (value) => {
                 if (!value) return false;
                 
                 if (Array.isArray(value)) {
                   return value.length > 0 && value.some(item => 
                     item && (item.name || item.filename || item.originalName || item.url || item.data)
                   );
                 }
                 
                 if (typeof value === 'object') {
                   return !!(value.name || value.filename || value.originalName || value.url || 
                            value.data || value.storage || value.size || 
                            (value.file && (value.file.name || value.file.url)));
                 }
                 
                 if (typeof value === 'string') {
                   const trimmed = value.trim();
                   return trimmed.length > 0 && (
                     trimmed.startsWith('data:') || trimmed.startsWith('http') ||  
                     trimmed.startsWith('/') || trimmed.includes('.')
                   );
                 }
                 
                 return false;
               };
               
               if (!hasValue && hasActualFileData(dataValue)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(componentData)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(getValue)) {
                 hasValue = true;
               }
               
               if (!hasValue && getValueAsString && hasActualFileData(getValueAsString)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(nestedData)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(privateData)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(rootComponentData)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(submissionComponentData)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(nestedPathData)) {
                 hasValue = true;
               }
               
               if (!hasValue && hasActualFileData(nestedSubmissionPathData)) {
                 hasValue = true;
               }
               
               if (!hasValue && component.files && Array.isArray(component.files) && component.files.length > 0) {
                 hasValue = true;
               }
               
               if (!hasValue && component.element) {
                 const fileInputs = component.element.querySelectorAll('input[type="file"]');
                 for (const input of fileInputs) {
                   if (input.files && input.files.length > 0) {
                     hasValue = true;
                     break;
                   }
                 }
               }
               
               if (!hasValue && component.fileService && component.fileService.files) {
                 const files = component.fileService.files;
                 if (Array.isArray(files) && files.length > 0) hasValue = true;
               }
               
               isActuallyInvalid = (isRequired && !hasValue) ||
                                  (hasCheckValidity && !hasValue);
                                  
             } else {
               if (component.checkValidity) {
                 isActuallyInvalid = !component.checkValidity();
               } else {
                 isActuallyInvalid = component.errors && component.errors.length > 0;
               }
             }
             
             if (isActuallyInvalid) {
               uniqueInvalidComponents.add(uniqueId);
               if (componentPath) {
                 invalidFields.add(componentPath);
               }
             }
           }
         }

        if (component.components && Array.isArray(component.components)) {
          component.components.forEach((child, index) => {
            const childPath = currentPath 
              ? `${currentPath}.${child.key || child.path || 'unknown'}`
              : child.key || child.path || child.component?.key;
            collectComponentErrors(child, uniqueId, index, childPath);
          });
        }

        if (component.rows && Array.isArray(component.rows)) {
          component.rows.forEach((row, rowIdx) => {
            if (row && typeof row === 'object') {
              Object.keys(row).forEach((colKey, colIdx) => {
                const cell = row[colKey];
                if (cell && cell.component && isVisibleFormField(cell.component)) {
                  const cellUniqueId = `${uniqueId}:row${rowIdx}:col${colIdx}:${colKey}`;
                  const cellPath = currentPath 
                    ? `${currentPath}[${rowIdx}].${colKey}`
                    : `${component.key || 'datagrid'}[${rowIdx}].${colKey}`;
                  collectComponentErrors(cell.component, cellUniqueId, 0, cellPath);
                }
              });
            }
          });
        }
      };
      collectComponentErrors(this.root, '', 0, '');
      
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
                 !otherField.includes('['); // Don't match array indices
        });
        
        if (hasShorterVersion) return;
        
        filteredInvalidFields.add(field);
      });
      
      const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, this.root, filteredInvalidFields);

      const allData = this.root.getValue();
      const supportNumber = allData?.data?.billingCustomer || "Unavailable";

      const modal = document.createElement("div");
      modal.style.zIndex = "1000";
      modal.className =
        "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";

      const fieldErrorCount = filteredInvalidFields ? filteredInvalidFields.size : 0;

      const hasErrors = fieldErrorCount > 0;

      modal.innerHTML = `
        <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>
          <div idx="22" class="mb-4 text-sm" style="max-height:200px; overflow-y:auto; border:1px solid #ccc; padding:8px;">
            ${reviewHtml}
          </div>
          ${hasErrors ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
             <p class="text-red-700 font-medium">⚠️ Fix the ${fieldErrorCount} error${fieldErrorCount === 1 ? '' : 's'} in the form before submitting</p>
          </div>` : ''}
          ${!hasErrors ? `
          <div class="flex space-x-4 mb-4">
            <div class="text-sm w-1/2">
              <label class="block font-medium mb-1">Support Number</label>
              <input type="text" id="supportNumber" class="w-full border rounded p-2 text-sm bg-gray-100" value="${supportNumber}" disabled />
            </div>
            <div class="text-sm w-1/2">
              <label class="block font-medium mb-1">Verified</label>
              <select id="verified" class="w-full border rounded p-2 text-sm">
                <option value="Empty">Select verification type</option>
                <option value="App">App</option>
                <option value="Support">Support</option>
                <option value="Not Verified">Not Verified</option>
              </select>
            </div>
          </div>` : ''}
          <div idx="23" class="mb-4 text-sm w-full" id="screenshotWrapper" style="display: none;">
            <label for="screenshotContainer">Screenshot Upload<span class="text-red-500">(Required)*</label>
            <div id="screenshotContainer"></div>
          </div>
          <div idx="24" class="mb-4 text-sm w-full" id="notesOptionalWrapper" style="display: none;">
            <label class="block font-medium mb-1">Notes (optional)</label>
            <textarea id="notesOptional" class="w-full border rounded p-2 text-sm"></textarea>
          </div>
          <div idx="25" class="mb-4 text-sm w-full" id="notesRequiredWrapper" style="display: none;">
            <label class="block font-medium mb-1">Explain why not verified<span class="text-red-500">(Required)*</span></label>
            <textarea id="notesRequired" class="w-full border rounded p-2 text-sm"></textarea>
          </div>
          <div class="mt-4 flex justify-end space-x-4">
            <button class="px-4 py-2 btn btn-primary rounded" id="cancelModal">${hasErrors ? 'Close' : 'Cancel'}</button>
            ${!hasErrors ? '<button class="px-4 py-2 btn btn-primary rounded" id="submitModal">Submit</button>' : ''}
          </div>
        </div>`;

      document.body.appendChild(modal);

      const screenshotComp = this.root.getComponent("screenshot");

      const hideScreenshot = () => {
        if (!screenshotComp) return;
        screenshotComp.component.hidden = true;
        if (typeof screenshotComp.setVisible === "function") {
          screenshotComp.setVisible(false);
        } else {
          screenshotComp.visible = false;
        }
        if (typeof this.root.redraw === "function") this.root.redraw();
      };

      const validateModalForm = () => {
        let hasErrors = false;

        const verifiedElement = modal.querySelector("#verified");
        const selectedVerificationType = verifiedElement ? verifiedElement.value : "Empty";

        if (verifiedElement && selectedVerificationType === "Empty") {
          verifiedElement.style.border = "2px solid red";
          verifiedElement.classList.add("invalid-field");
          hasErrors = true;

        } else if (verifiedElement) {
          verifiedElement.style.border = "";
          verifiedElement.classList.remove("invalid-field");
        }

        const supportNumberElement = modal.querySelector("#supportNumber");
        if (supportNumberElement && !supportNumberElement.value.trim()) {
          supportNumberElement.style.border = "2px solid red";
          supportNumberElement.classList.add("invalid-field");
          hasErrors = true;
        } else if (supportNumberElement) {
          supportNumberElement.style.border = "";
          supportNumberElement.classList.remove("invalid-field");
        }

        if (selectedVerificationType === "App" || selectedVerificationType === "Support") {
          const screenshotComp = this.root.getComponent("screenshot");
          const uploadedFiles = screenshotComp ? (screenshotComp.getValue() || []) : [];

          if (uploadedFiles.length === 0) {
            const screenshotContainer = modal.querySelector("#screenshotContainer");
            if (screenshotContainer) {
              screenshotContainer.style.border = "2px solid red";
              hasErrors = true;
            }
          } else if (modal.querySelector("#screenshotContainer")) {
            modal.querySelector("#screenshotContainer").style.border = "";
          }
        }

        if (selectedVerificationType === "Not Verified") {
          const notesRequiredElement = modal.querySelector("#notesRequired");
          if (notesRequiredElement && !notesRequiredElement.value.trim()) {
            notesRequiredElement.style.border = "2px solid red";
            notesRequiredElement.classList.add("invalid-field");
            hasErrors = true;
          } else if (notesRequiredElement) {
            notesRequiredElement.style.border = "";
            notesRequiredElement.classList.remove("invalid-field");
          }
        }

        const submitButton = modal.querySelector("#submitModal");
        if(submitButton && submitButton.style != null){
          if (hasErrors) {
            submitButton.style.backgroundColor = "gray";
            submitButton.style.cursor = "not-allowed";
            submitButton.disabled = true;
          } else {
            submitButton.style.backgroundColor = "";
            submitButton.style.cursor = "pointer";
            submitButton.disabled = false;
          }
        }
      };

      if (screenshotComp) {
        this.component._screenshotPrev = {
          hidden: screenshotComp.component.hidden,
          visible: screenshotComp.visible,
        };

        screenshotComp.component.hidden = false;
        if (typeof screenshotComp.setVisible === "function") {
          screenshotComp.setVisible(true);
        } else {
          screenshotComp.visible = true;
        }

        const html = screenshotComp.render();
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const compEl = tmp.firstElementChild;
        modal.querySelector("#screenshotContainer").appendChild(compEl);
        screenshotComp.attach(compEl);

        if (screenshotComp && typeof screenshotComp.on === 'function') {
          screenshotComp.on('change', validateModalForm);
        }
      }


      const onSubmitError = () => {
        hideScreenshot();
        this.root.off("submitError", onSubmitError);
      };
      this.root.on("submitError", onSubmitError);


      const verifiedSelect = modal.querySelector("#verified");
      const screenshotWrapper = modal.querySelector("#screenshotWrapper");
      const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
      const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");

      if (verifiedSelect) {
        verifiedSelect.onchange = () => {
          const value = verifiedSelect.value;
          const needShot = value === "App" || value === "Support";
          screenshotWrapper.style.display = needShot ? "block" : "none";
          notesOptionalWrapper.style.display = needShot ? "block" : "none";
          notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
        };
      }

      modal.querySelector("#cancelModal").onclick = async () => {
        hideScreenshot();

        try {
          await this.validateFormExternal({
            showErrors: true,
            scrollToError: true
          });
        } catch (validationError) {
          console.error("Error during validation rerun after cancel:", validationError);
        }

        document.body.removeChild(modal);
        this.root.off("submitError", onSubmitError);
      };

      const addInputListeners = (element) => {
        if (!element) return;

        const inputs = element.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
          input.addEventListener('input', validateModalForm);
          input.addEventListener('change', validateModalForm);
        });

        const verifiedSelect = modal.querySelector("#verified");
        if (verifiedSelect) {
          verifiedSelect.addEventListener('input', validateModalForm);
          verifiedSelect.addEventListener('change', validateModalForm);
        }
      };

      addInputListeners(modal);

      const submitButton = modal.querySelector("#submitModal");
      submitButton.style.backgroundColor = "gray";
      submitButton.style.cursor = "not-allowed";
      submitButton.disabled = true;
      if (submitButton) {
        submitButton.onclick = async () => {
          validateModalForm();

          const verifiedElement = modal.querySelector("#verified");
          const selectedVerificationType = verifiedElement ? verifiedElement.value : "Empty";
          let hasErrors = false;

          if (verifiedElement && selectedVerificationType === "Empty") {
            hasErrors = true;
          }

          const supportNumberElement = modal.querySelector("#supportNumber");
          if (supportNumberElement && !supportNumberElement.value.trim()) {
            hasErrors = true;
          }

          if (selectedVerificationType === "App" || selectedVerificationType === "Support") {
            const screenshotComp = this.root.getComponent("screenshot");
            const uploadedFiles = screenshotComp ? (screenshotComp.getValue() || []) : [];
            if (uploadedFiles.length === 0) {
              hasErrors = true;
            }
          }

          if (selectedVerificationType === "Not Verified") {
            const notesRequiredElement = modal.querySelector("#notesRequired");
            if (notesRequiredElement && !notesRequiredElement.value.trim()) {
              hasErrors = true;
            }
          }

          if (hasErrors) {
            return; // Don't submit if there are errors
          }


        const notesRequired = modal.querySelector("#notesRequired")?.value || "";
        const notesOptional = modal.querySelector("#notesOptional")?.value || "";
        const supportNumber = supportNumberElement?.value || "Unavailable";

        const screenshotComp = this.root.getComponent("screenshot");
        let uploadedFiles = [];
        if (screenshotComp) {
          uploadedFiles = screenshotComp.getValue() || [];
        } else if (selectedVerificationType === "App" || selectedVerificationType === "Support") {
          alert("Review page can't find reference to file upload screenshotComp. Please add a File Upload component with key 'screenshot'.");
          return;
        }


        if (selectedVerificationType === "Not Verified" && !notesRequired.trim()) {
          alert("Please explain why not verified.");
          return;
        }
        if (
          (selectedVerificationType === "App" || selectedVerificationType === "Support") &&
          uploadedFiles.length === 0
        ) {
          alert("Screenshot is required for App or Support verification.");
          return;
        }

        this.root.getComponent("reviewed")?.setValue("true");
        this.root.getComponent("supportNumber")?.setValue(supportNumber);
        this.root.getComponent("verifiedSelect")?.setValue(selectedVerificationType);
        this.root.getComponent("notesOptional")?.setValue(notesOptional);
        this.root.getComponent("notesRequired")?.setValue(notesRequired);

        this.component._reviewModalCache = {
          verifiedSelect: selectedVerificationType,
          notesRequired,
          notesOptional,
          supportNumber,
        };

        hideScreenshot();
        document.body.removeChild(modal);
        this.root.off("submitError", onSubmitError);

        this.emit("submitButton", { type: "submit" });
        };
      }

      const cached = this.component._reviewModalCache;
      if (cached) {
        const verifiedElement = modal.querySelector("#verified");
        if (verifiedElement) {
          verifiedElement.value = cached.verifiedSelect || "";
          verifiedElement.dispatchEvent(new Event("change"));
        }
        const notesRequiredElement = modal.querySelector("#notesRequired");
        if (notesRequiredElement) {
          notesRequiredElement.value = cached.notesRequired || "";
        }
        const notesOptionalElement = modal.querySelector("#notesOptional");
        if (notesOptionalElement) {
          notesOptionalElement.value = cached.notesOptional || "";
        }
        const supportNumberElement = modal.querySelector("#supportNumber");
        if (supportNumberElement) {
          supportNumberElement.value = cached.supportNumber || "Unavailable";
        }
      }
    });

    return super.attach(element);
  }
}


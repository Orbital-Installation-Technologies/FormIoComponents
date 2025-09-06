import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

const FieldComponent = Components.components.field;

/**
 * Helper function to check if a component type is a container type.
 * @param {string|string[]} t - The component type(s) to check - can be a single string or array of strings
 * @param {string[]} exclude - Array of container types to exclude from the check
 * @returns {boolean} True if any of the component types is a container type (and not excluded)
 */
const isContainerType = (t, exclude = []) => {
  const containerTypes = ['panel', 'columns', 'well', 
                         'fieldset', 'datamap', 'editgrid', 'table', 'tabs', 
                         'row', 'column', 'content', 'htmlelement',];
  
  const allowedTypes = containerTypes.filter(type => !exclude.includes(type));
  
  if (Array.isArray(t)) {
    return t.some(type => type && allowedTypes.includes(type));
  }
  
  return allowedTypes.includes(t);
};

/**
 * Helper function to check if a component type should be flattened (hidden with children promoted to root)
 * @param {string|string[]} t - The component type(s) to check
 * @returns {boolean} True if the component type should be flattened
 */
const shouldFlattenContainer = (t) => {
  const flattenTypes = ['columns', 'fieldset', 'tabs', 'tagpad', 'survey', 
                       'panel', 'well', 'container', 'datagrid', 'datatable', 
                       'datamap', 'editgrid'];
  
  if (Array.isArray(t)) {
    return t.some(type => type && flattenTypes.includes(type?.toLowerCase()));
  }
  
  return flattenTypes.includes(t?.toLowerCase());
};

/**
 * ReviewButton Component for Form.io
 * Handles form validation and submission review functionality
 */
/**
 * Finds a component by key within the component tree
 * @param {Object} root - Root component to search from
 * @param {string} targetKey - Key of the component to find
 * @param {string} currentPath - Current path for recursion (internal use)
 * @returns {Object|null} - Found component or null if not found
 */
function findComponentByKey(root, targetKey, currentPath = '') {
  if (!root || !targetKey) return null;

  // Check if current component matches the key
  const currentKey = root.key || root.component?.key;
  if (currentKey === targetKey) {
    return {
      component: root,
      path: currentPath,
      parent: null // Could be enhanced to track parent
    };
  }

  // Search in components array (for containers)
  if (Array.isArray(root.components)) {
    for (let i = 0; i < root.components.length; i++) {
      const child = root.components[i];
      if (child) {
        const childPath = currentPath ? `${currentPath}.${child.key || child.component?.key || i}` : (child.key || child.component?.key || i);
        const found = findComponentByKey(child, targetKey, childPath);
        if (found) {
          return found;
        }
      }
    }
  }

  // Search in subForm (for form components)
  if (root.subForm && typeof root.subForm === 'object') {
    const subFormPath = currentPath ? `${currentPath}.subForm` : 'subForm';
    const found = findComponentByKey(root.subForm, targetKey, subFormPath);
    if (found) {
      return found;
    }
  }

  // Search in editRows (for editgrid components)
  if (Array.isArray(root.editRows)) {
    for (let i = 0; i < root.editRows.length; i++) {
      const row = root.editRows[i];
      if (row && Array.isArray(row.components)) {
        for (let j = 0; j < row.components.length; j++) {
          const child = row.components[j];
          if (child) {
            const rowPath = currentPath ? `${currentPath}[${i}].${child.key || child.component?.key || j}` : `[${i}].${child.key || child.component?.key || j}`;
            const found = findComponentByKey(child, targetKey, rowPath);
            if (found) {
              return found;
            }
          }
        }
      }
    }
  }

  // Search in editForms (for tagpad components)
  if (Array.isArray(root.editForms)) {
    for (let i = 0; i < root.editForms.length; i++) {
      const form = root.editForms[i];
      if (form) {
        const formPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
        const found = findComponentByKey(form, targetKey, formPath);
        if (found) {
          return found;
        }
      }
    }
  }

  return null;
}

export default class ReviewButton extends FieldComponent {
  static editForm = editForm;

  /**
   * Schema definition for the component
   */
  static schema(...extend) {
    return FieldComponent.schema(
      {
        type: "reviewbutton",
        label: "Review and Submit",
        key: "reviewButton",
        input: false,
      },
      ...extend,
    );
  }

  /**
   * Builder information for Form.io builder
   */
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

  /**
   * Initialize component
   */
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

  /**
   * Register validation methods on the root form
   */
  registerFormValidationMethods() {
    this.root.validateFormExternal = async (options) => {
      return await this.validateFormExternal(options);
    };

    this.root.isFormValid = async () => {
      return await this.isFormValid();
    };

    this.root.validateFields = async (fieldKeys, options) => {
      return await this.validateFields(fieldKeys, options);
    };

    this.root.triggerValidation = async (options) => {
      return await this.triggerValidation(options);
    };
  }

  /**
   * Setup validation event handler
   */
  setupValidationEventHandler() {
    this.root.on("validateForm", async (callback) => {
      const results = await this.validateFormExternal();
      if (typeof callback === "function") {
        callback(results);
      }
      return results;
    });
  }

  /**
   * Expose validation methods to window object for external access
   */
  exposeValidationMethods() {
    if (typeof window !== 'undefined') {
      window.formValidation = {
        validate: async (options) => await this.validateFormExternal(options),
        validateFields: async (fields, options) => await this.validateFields(fields, options),
        isValid: async () => await this.isFormValid()
      };
    }
  }

  /**
   * Basic form validation
   * @returns {Promise<boolean>} Whether the form is valid
   */
  async validateForm() {
    try {
      let isValid = true;

      this.root.everyComponent(component => {
        if (component.checkValidity) {
          const valid = component.checkValidity(component.data, true);
          if (!valid) {
            isValid = false;
            component.setCustomValidity(component.errors, true);
          }
        }
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

  /**
   * Scroll to the first error element in the form
   */
  scrollToFirstError() {
    const firstError = this.root.element.querySelector('.formio-error-wrapper, .has-error, .is-invalid');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }


  /**
   * Mark all components as dirty for validation
   */
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

  /**
   * Mark all datagrid rows as dirty for validation
   */
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

  /**
   * Scroll to the first error element with advanced selector
   */
  scrollToFirstErrorAdvanced() {
    const firstError = this.root?.element?.querySelector?.(
      '.formio-error-wrapper, .has-error, .is-invalid, [data-component-error="true"]'
    );
    if (firstError?.scrollIntoView) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Validate specific fields in the form
   * @param {string|string[]} fieldKeys - Keys of fields to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
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

  /**
   * Initialize the validation results object
   * @returns {Object} Empty validation results structure
   */
  initializeValidationResults() {
    return {
      isValid: true,
      fieldResults: {},
      errors: {},
      invalidComponents: []
    };
  }

  /**
   * Find components that match the given keys
   * @param {string[]} keys - Component keys to find
   * @returns {Array} Array of matching components
   */
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

  /**
   * Validate the selected components and update results
   * @param {Array} components - Components to validate
   * @param {Object} results - Results object to update
   * @param {Object} options - Validation options
   */
  async validateSelectedComponents(components, results, options) {
    for (const component of components) {
      const componentKey = component.key || component.path;
      const componentLabel = component.component?.label || componentKey;
      const componentPath = component.path || componentKey;

      this.markComponentAsDirty(component);

      const isValid = component.checkValidity ? component.checkValidity(component.data, true) : true;

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

  /**
   * Mark a component as dirty for validation
   * @param {Object} component - The component to mark as dirty
   */
  markComponentAsDirty(component) {
    if (typeof component.setPristine === 'function') component.setPristine(false);
    if (typeof component.setDirty === 'function') component.setDirty(true);
  }

  /**
   * Record validation results for a component
   * @param {Object} results - Results object to update
   * @param {Object} component - The component that was validated
   * @param {string} key - Component key
   * @param {string} label - Component label
   * @param {string} path - Component path
   * @param {boolean} isValid - Whether the component is valid
   * @param {boolean} showErrors - Whether to display errors
   */
  recordComponentValidationResult(results, component, key, label, path, isValid, showErrors) {
    results.fieldResults[key] = {
      isValid,
      errors: component.errors || [],
      label,
      path
    };

    if (!isValid) {
      results.isValid = false;
      results.errors[key] = {
        label,
        errors: component.errors || ['Invalid']
      };
      results.invalidComponents.push({
        component,
        path,
        label
      });

      if (showErrors && component.setCustomValidity) {
        component.setCustomValidity(component.errors, true);
      }
    }
  }

  /**
   * Update UI with validation errors
   * @param {Object} results - Validation results
   * @param {boolean} scrollToError - Whether to scroll to the first error
   */
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

  /**
   * Create error results when validation fails unexpectedly
   * @returns {Object} Error results object
   */
  createErrorResults() {
    return {
      isValid: false,
      fieldResults: {},
      errors: { system: { label: 'System', errors: ['Field validation failed'] } },
      invalidComponents: []
    };
  }

  /**
   * Check if the form is valid without showing errors
   * @returns {Promise<boolean>} Whether the form is valid
   */
  async isFormValid() {
    try {
      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      let isValid = true;

      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            const shouldValidate = c.checkValidity && c.visible !== false && !c.disabled;

            if (shouldValidate && !c.checkValidity(c.data, false)) {
              isValid = false;
            }
          } catch { }
        });
      }

      return isValid;
    } catch (e) {
      console.error('isFormValid check error:', e);
      return false;
    }
  }


  /**
   * Comprehensive form validation with detailed results
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Detailed validation results
   */
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

  /**
   * Initialize results for external validation
   * @returns {Object} Empty validation results structure
   */
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

  /**
   * Validate components and collect results in maps
   * @param {Map} errorMap - Map to collect errors
   * @param {Map} warningMap - Map to collect warnings
   * @param {Object} results - Results object to update
   * @param {Object} opts - Validation options
   */
  async validateComponentsAndCollectResults(errorMap, warningMap, results, opts) {
    this.root.everyComponent((component) => {
      try {
        if (!component.visible || component.disabled) return;

        if (component.checkValidity) {
          const isValid = component.checkValidity(component.data, true);

          if (!isValid) {
            this.processComponentErrors(component, errorMap, results, opts.showErrors);
          }

          if (opts.includeWarnings && component.warnings && component.warnings.length) {
            this.processComponentWarnings(component, warningMap, results);
          }
        }
      } catch (err) {
        console.error(`Error validating component ${component.key}:`, err);
      }
    });
  }

  /**
   * Process component errors and update results
   * @param {Object} component - Component with errors
   * @param {Map} errorMap - Map to collect errors
   * @param {Object} results - Results object to update
   * @param {boolean} showErrors - Whether to display errors
   */
  processComponentErrors(component, errorMap, results, showErrors) {
    results.isValid = false;
    results.errorCount++;

    const componentKey = component.key || component.path;
    const componentLabel = component.component?.label || componentKey;
    const componentPath = component.path || componentKey;

    if (component.errors && component.errors.length) {
      component.errors.forEach(error => {
        if (!errorMap.has(componentPath)) {
          errorMap.set(componentPath, {
            label: componentLabel,
            errors: []
          });
        }
        errorMap.get(componentPath).errors.push(error);
      });
    }

    results.invalidComponents.push({
      component,
      path: componentPath,
      label: componentLabel
    });

    if (showErrors) {
      component.setCustomValidity(component.errors, true);
    }
  }

  /**
   * Process component warnings and update results
   * @param {Object} component - Component with warnings
   * @param {Map} warningMap - Map to collect warnings
   * @param {Object} results - Results object to update
   */
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

  /**
   * Generate error summary text from error map
   * @param {Map} errorMap - Map of errors
   * @param {Object} results - Results object to update
   */
  generateErrorSummary(errorMap, results) {
    const errorSummaryLines = [];

    errorMap.forEach((data, path) => {
      data.errors.forEach(error => {
        errorSummaryLines.push(`${data.label}: ${error}`);
      });
    });

    results.errorSummary = errorSummaryLines.join('\n');
  }

  /**
   * Handle UI updates for external validation
   * @param {Object} results - Validation results
   * @param {Object} opts - Validation options
   */
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

  /**
   * Create error results when external validation fails unexpectedly
   * @returns {Object} Error results object
   */
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

  /**
   * Trigger form validation with optional summary display
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
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

  /**
   * Display a validation error summary popup
   * @param {Object} results - Validation results containing errors
   */
  showValidationErrorSummary(results) {
    const errorSummaryEl = this.createErrorSummaryElement();
    errorSummaryEl.innerHTML = this.generateErrorSummaryContent(results);
    document.body.appendChild(errorSummaryEl);
    this.setupErrorSummaryCloseButton(errorSummaryEl);
    this.setupErrorSummaryAutoDismiss(errorSummaryEl);
  }

  /**
   * Create the error summary element with styles
   * @returns {HTMLElement} Styled error summary element
   */
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

  /**
   * Generate the HTML content for the error summary
   * @param {Object} results - Validation results
   * @returns {string} HTML content for the error summary
   */
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

  /**
   * Setup the close button for the error summary
   * @param {HTMLElement} summaryElement - The error summary element
   */
  setupErrorSummaryCloseButton(summaryElement) {
    const closeButton = summaryElement.querySelector('.close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        document.body.removeChild(summaryElement);
      });
    }
  }

  /**
   * Setup auto-dismiss for the error summary
   * @param {HTMLElement} summaryElement - The error summary element
   */
  setupErrorSummaryAutoDismiss(summaryElement) {
    setTimeout(() => {
      if (document.body.contains(summaryElement)) {
        document.body.removeChild(summaryElement);
      }
    }, 10000); // 10 seconds
  }

  /**
   * Render the component
   * @returns {string} Rendered HTML
   */
  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  /**
   * Update all form values to ensure the latest data is captured
   * @returns {Promise<void>}
   */
  async updateFormValues() {
    try {
          await new Promise(resolve => setTimeout(resolve, 100));

    const allDatagrids = [];
      try {
        if (this.root && typeof this.root.everyComponent === 'function') {
          this.root.everyComponent(comp => {
            if (comp && comp.component &&
              (comp.component.type === 'datagrid' || comp.component.type === 'datatable')) {
              allDatagrids.push(comp);
            }
          });
        }
      } catch (e) {
        console.error("Error collecting datagrids/datatables:", e);
      }

          for (const datagrid of allDatagrids) {
        try {
          this.updateDatagridValues(datagrid);
        } catch (e) {
          console.error("Error updating datagrid/datatable values:", e);
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

  /**
   * Update values in a datagrid/datatable component
   * @param {Object} datagrid - Datagrid or datatable component
   */
  updateDatagridValues(datagrid) {
    if (datagrid && datagrid.updateValue && typeof datagrid.updateValue === 'function') {
      try {
        datagrid.updateValue();
      } catch (e) {
        console.error("Error updating datagrid value:", e);
      }
    }

    if (datagrid && datagrid.component?.type === 'datatable' && Array.isArray(datagrid.savedRows)) {
      datagrid.savedRows.forEach(row => {
        if (row && Array.isArray(row.components)) {
          row.components.forEach(component => {
            this.safelyUpdateComponent(component, 'datatable row component');
          });
        }
      });
    }
    else if (datagrid && Array.isArray(datagrid.rows)) {
      datagrid.rows.forEach(row => {
        if (row && typeof row === 'object') {
          Object.values(row).forEach(component => {
            this.safelyUpdateComponent(component, 'datagrid row component');
          });
        }
      });
    }
  }

  /**
   * Safely update a component's value with error handling
   * @param {Object} component - The component to update
   * @param {string} context - Context information for debugging
   */
  safelyUpdateComponent(component, context) {
    if (!component) return;

    if (component.type === 'select' && (!component.choices || !Array.isArray(component.choices))) {
      console.warn(`Skipping Select component update in ${context} - missing choices array`);
      return;
    }

    if (component.updateValue && typeof component.updateValue === 'function') {
      try {
        if (component.type === 'select' && typeof component.resetValue !== 'function') {
          console.warn(`Select component in ${context} missing resetValue method - skipping update`);
          return;
        }

        component.updateValue();
      } catch (e) {
        console.error(`Error updating component value in ${context}:`, e);
      }
    }
  }

  /**
   * Update values in top-level components
   */
  updateTopLevelComponentValues() {
    if (Array.isArray(this.root.components)) {
      this.root.components.forEach(comp => {
        this.safelyUpdateComponent(comp, 'top-level component');
      });
    }
  }

  /**
   * Handle the click event on the review button
   */
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

  /**
   * Attach the component to the DOM
   * @param {HTMLElement} element - Element to attach to
   * @returns {HTMLElement} The attached element
   */
  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {


      try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const allDatagrids = [];
        this.root.everyComponent(comp => {
          if (comp.component?.type === 'well' || comp.type === 'well' ||
            comp.component?.type === 'table' || comp.type === 'table') {
            allDatagrids.push(comp);
          }
        });
        for (const datagrid of allDatagrids) {
          try {
            if (datagrid.updateValue) {
              datagrid.updateValue();
            }
            if (datagrid.component?.type === 'datatable' && datagrid.savedRows) {
              datagrid.savedRows.forEach(row => {
                if (row.components) {
                  row.components.forEach(component => {
                    if (component && component.updateValue) {
                      component.updateValue();
                    }
                  });
                }
              });
            } else if (datagrid.rows) {
              datagrid.rows.forEach(row => {
                Object.values(row).forEach(component => {
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
        this.root.components.forEach(comp => {
          if (comp.updateValue && typeof comp.updateValue === 'function') {
            try {
              comp.updateValue();
            } catch (e) { }
          }
        });
      } catch (e) { }

      /**
       * Processes container-type components (tables, panels, wells, etc.) into a structured format for review
       * @param {Object} component - The Form.io component to process
       * @returns {Object} A structured representation of the component for review display
       */
      const customComponentForReview = (component) => {
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
            const colDefs = Array.isArray(component.components) ? component.components : [];
            const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
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

          const tableRows = [];
          const processedFields = new Map();

          dataRows.forEach((rowObj, rIdx) => {
            if (!processedFields.has(rIdx)) processedFields.set(rIdx, new Set());
            const rowDone = processedFields.get(rIdx);
            const rowData = [];

            colDefs.forEach((col, i) => {
              const colKey = col.key || col.component?.key;
              const colLabel = columnLabels[i] || colKey;

              if (!colKey || rowDone.has(colKey)) return;

              const val = typeof rowObj === 'object' ? rowObj[colKey] : '';
              console.log("colKey", colKey, "colLabel", colLabel, "val", val)
              rowData.push({
                _children: {
                  _label: colLabel,
                  _key: colKey,
                  _type: col.type || col.component?.type,
                  _leaf: true,
                  _value: val
                }
              });

              rowDone.add(colKey);
            });

            tableRows.push({ _row: rowData });
          });
          console.log("label3", label, "key", key, "componentType", componentType, "tableRows", tableRows)
          return {
            _label: label,
            _key: key,
            _type: componentType,
            _row: tableRows
          };
        } else if (isContainerType(componentType)) {
          const children = component.components || [];
          
          // Check if this container should be flattened
          if (shouldFlattenContainer(componentType)) {
            // For flattened containers, return children directly without container wrapper
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
            
            // Return the children as a flattened array instead of wrapped in container
            return childItems.length > 0 ? childItems : null;
          }
          
          // For non-flattened containers, use original logic
          const containerItems = children.filter(child => {
            return child.component?.reviewVisible || child?.component.validate.required;
          }) 
          .map(child => {
            const childKey = child.key || child.path || '';
            const childValue = child.dataValue || (data[childKey] || '');
            console.log("childKey", childKey, "childValue", childValue)
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
          console.log("label2", label, "key", key, "componentType", componentType, "tableRows", tableRows)
          return {
            _label: label,
            _key: key,
            _type: componentType,
            _row: containerItems
          };
        }
        console.log("label1", label, "key", key, "componentType", componentType, "tableRows", tableRows)
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



        // Track paths we've already processed to avoid duplicates
        const pushedPaths = new Set();

        /**
         * Canonicalize paths to avoid duplicates from form.data., submission., etc.
         * @param {string} p - Path to canonicalize
         * @returns {string} Normalized path
         */
        const canon = (p = '') => {
          // Aggressive canonicalization to ensure uniqueness
          let normalized = p
            .replace(/^form\./, '')
            .replace(/^submission\./, '')
            .replace(/(^|\.)data(\.|$)/g, '$1')
            .replace(/\.data\./g, '.')
            .replace(/^\d+\./, '')     // Remove leading array indices
            .replace(/\.\d+\./g, '.'); // Remove intermediate array indices

          // Handle array notation consistently
          if (normalized.includes('[')) {
            // Extract the base path and the array indices
            const matches = normalized.match(/^(.+?)(\[\d+\].*)$/);
            if (matches) {
              const basePath = matches[1];
              const arrayPart = matches[2];
              normalized = `${basePath}${arrayPart}`;
            }
          }

          return normalized;
        };

        /**
         * Add a leaf component to the collection
         * @param {Object} leaf - Component to add
         */
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
          console.log("enqueueAll", f)
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
          console.log("comp", comp)

          // Check if this is an Address component
          const isAddressComponentEarly = comp.component?.type === 'address' || comp.type === 'address';

          // Debug logging for Address components
          if (isAddressComponentEarly) {
            console.log('Processing Address component:', comp.key, comp.component?.label, 'visible:', comp.visible, '_visible:', comp._visible, 'reviewVisible:', comp.component?.reviewVisible, 'required:', comp.component?.validate?.required);
          }

          if (comp?._visible == false || ((!comp?.component.reviewVisible && !comp?.component.validate.required) && !isAddressComponentEarly)) continue;

          // Skip button components
          if (comp.type === 'button' || comp.component?.type === 'button') continue;

          if (isContainerType(comp.component?.type) && Array.isArray(comp.rows) && comp.rows.length) {

            const dataMapPath = safePath(comp);
            // Hide datamap label - commented out to hide label
            // labelByPathMap.set(dataMapPath, comp.component?.label || comp.key);
            indexByPathMap.set(dataMapPath, topIndexFor(comp));

            comp.rows.forEach((row, rIdx) => {
              // For DataMap, each row is an object with __key and value components
              const keyComp = row.__key;
              const valueComp = row.value;

              // Get key and value
              const key = keyComp ? (keyComp.getValue ? keyComp.getValue() : keyComp.dataValue) : '';
              const value = valueComp ? (valueComp.getValue ? valueComp.getValue() : valueComp.dataValue) : '';
              console.log("key", key, "value", value)
              // Push key leaf
              if(!key) return;
              pushLeaf({
                comp: keyComp,
                path: `${dataMapPath}[${rIdx}].key`,
                label: key,
                value: value,
                formIndex: topIndexFor(comp)
              });
            });
            continue;
          }

          const compPath = safePath(comp);
          if (compPath && processedPaths.has(compPath)) {
            continue;
          }

          if (compPath) processedPaths.add(compPath);

          if (comp.type === 'form') {
            if (comp.subFormReady) await comp.subFormReady;

            const containerTitle = comp.formObj?.title || comp.component?.label || comp.key || 'Form';
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

            metaByPathMap.set(gridPath, {
              kind: comp.component?.type === 'datatable' ? 'datatable' : 'datagrid',
              columnKeys,
              columnLabels
            });

            const pushValueLeaf = (node, basePath) => {
              console.log("node", node, "basePath", basePath)
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
                  console.log("cKey", cKey, "cLabel", cLabel, "val", val)
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
            (comp.component?.type === 'datatable' && !comp.savedRows)) {
            continue;
          }

          if (comp.component?.type === 'editgrid' && Array.isArray(comp.editRows) && comp.editRows.length) {
            const gridPath = safePath(comp);
            indexByPathMap.set(gridPath, topIndexFor(comp));
            console.log("comp.editRows", comp.editRows)
            comp.editRows.forEach((r, rIdx) => (r.components || []).forEach((ch) => {
              ch.__reviewPath = `${gridPath}[${rIdx}].${ch.key || 'Missing Value 4'}`;
              queue.push(ch);
            }));
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

            // Check if this container should be flattened
            if (shouldFlattenContainer(componentType)) {
              // For flattened containers, skip adding the container to labels and just add children to queue
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
          const parentsToBeHandled = ['datatable', 'datagrid', 'editgrid', 'tagpad', 'datamap', 
                                      'panel', 'well', 'table', 'tabs', 'fieldset', 'columns'];
          // For flattened containers, don't consider them as "handled" parents
          const parentIsHandled = parentsToBeHandled.includes(parentType) && 
                                  !shouldFlattenContainer(parentType);

          // Check if component is inside a TagPad form
          const isInTagpadForm =
            parent && parentType === 'tagpad' &&
            comp.__reviewPath && comp.__reviewPath.includes('[') && comp.__reviewPath.includes(']');

          // Always include Tagpad components regardless of visibility
          const isTagpadComponent = comp.type === 'tagpad' || comp.component?.type === 'tagpad' || isInTagpadForm;

          // Skip content and htmlelement components
          const isContentComponent = isContainerType([comp?.type, comp?.component?.type]);

          // Extra check to ensure we don't get duplicate fields from datatables/datagrids
          const componentPath = safePath(comp);
          const pathParts = (componentPath || '').split('.');
          const hasArrayNotation = componentPath && componentPath.includes('[') && componentPath.includes(']');
          const isGridChild = hasArrayNotation || pathParts.some(part => /^\d+$/.test(part));

          // Check if this is a form or panel component
          const isFormComponent = comp.type === 'form' || comp.component?.type === 'form';
          const isPanelComponent = comp.type === 'panel' || comp.component?.type === 'panel';
          const componentType = comp.type || comp.component?.type;

          // Skip flattened containers from being processed as regular containers
          if (shouldFlattenContainer(componentType)) {
            // For flattened containers, skip container processing and let children be processed normally
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

          // Check if this is an Address component
          const isAddressComponentMain = comp.component?.type === 'address' || comp.type === 'address';

          // Debug logging for Address components in main filter
          if (isAddressComponentMain) {
            console.log('Address component in main filter:', comp.key, 'parentIsHandled:', parentIsHandled, 'isContentComponent:', isContentComponent, 'isGridChild:', isGridChild, 'visible:', comp.visible);
          }

          if (
            !parentIsHandled &&
            !isContentComponent &&
            !isGridChild &&
            comp.visible !== false &&
            (comp.component?.reviewVisible === true || comp?.component.validate.required || isTagpadComponent || isFormComponent || isPanelComponent || isContainerComponent || isAddressComponentMain)
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


            // Debug logging when adding Address component to leaves
            if (isAddressComponentMain) {
              componentValue = comp.dataValue?.formattedPlace || "";
              console.log('Adding Address component to leaves:', comp.key, 'path:', comp.__reviewPath || safePath(comp) || comp.key, 'value:', componentValue);
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

            // Skip flattened containers from being added as container leaves
            if (shouldFlattenContainer(containerType)) {
              // For flattened containers, skip adding the container itself and let children be processed normally
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
                  label: containerLabel,
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

        // Convert Maps to plain objects
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

        // Sort leaves based on their original position in form.components
        const sortedLeaves = [...leaves].sort((a, b) => {
          // Check if either is a panel or well component (but not flattened)
          const isPanelA = a.comp?.component?.type === 'panel' || a.comp?.type === 'panel';
          const isPanelB = b.comp?.component?.type === 'panel' || b.comp?.type === 'panel';
          const isWellA = a.comp?.component?.type === 'well' || a.comp?.type === 'well';
          const isWellB = b.comp?.component?.type === 'well' || b.comp?.type === 'well';

          // Check if components should be flattened
          const isFlattenedA = shouldFlattenContainer([a.comp?.type, a.comp?.component?.type]);
          const isFlattenedB = shouldFlattenContainer([b.comp?.type, b.comp?.component?.type]);

          // Treat both panel and well as container components, but exclude flattened ones
          const isContainerA = (isPanelA || isWellA) && !isFlattenedA;
          const isContainerB = (isPanelB || isWellB) && !isFlattenedB;

          // Container components should appear before their children
          if (isContainerA && !isContainerB) {
            return -1; // Container comes first
          }
          if (!isContainerA && isContainerB) {
            return 1; // Container comes first
          }

          // Special handling for tagpad components to ensure they're in the correct position
          const isTagpadA = a.comp?.component?.type === 'tagpad' || a.comp?.type === 'tagpad' ||
            a.path?.includes('tagpad') || a.label?.startsWith('Tag ');
          const isTagpadB = b.comp?.component?.type === 'tagpad' || b.comp?.type === 'tagpad' ||
            b.path?.includes('tagpad') || b.label?.startsWith('Tag ');

          // If one is a tagpad and the other isn't, use their formIndex
          if (isTagpadA && !isTagpadB) {
            return a.formIndex >= 0 ? -1 : 0;
          }
          if (!isTagpadA && isTagpadB) {
            return b.formIndex >= 0 ? 1 : 0;
          }

          // If both have valid formIndex, sort by that
          if (a.formIndex >= 0 && b.formIndex >= 0) {
            return a.formIndex - b.formIndex;
          }
          // If only one has valid formIndex, prioritize it
          if (a.formIndex >= 0) return -1;
          if (b.formIndex >= 0) return 1;

          // Sort by path length to ensure parent components come before children
          if (a.path && b.path) {
            const aDepth = (a.path.match(/\./g) || []).length;
            const bDepth = (b.path.match(/\./g) || []).length;

            if (aDepth !== bDepth) {
              return aDepth - bDepth; // Shorter paths (parent components) come first
            }

            return a.path.localeCompare(b.path);
          }

          // Otherwise, keep original order
          return 0;
        });

        const root = {};
        const ensureNode = (obj, k, compRef) => {
          // Safety check: if obj is null or undefined, return an empty object
          if (obj == null) {
            return {
              __children: {}, __rows: {}, __label: null, __suppress: false,
              __kind: null, __colKeys: null, __colLabels: null,
              __formIndex: -1,
              __comp: compRef || undefined
            };
          }
          // If k is not a string or number, log error and use a safe default
          if (typeof k !== 'string' && typeof k !== 'number') {
            k = String(k || 'unknown');
          }
          // Now safely ensure the node exists
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
          if (m && !node.__kind) {
            node.__kind = m.kind;
            node.__colKeys = m.columnKeys || [];
            node.__colLabels = m.columnLabels || [];
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

          // First try exact match
          if (invalidFields.has(fieldPath)) {
            console.log('Exact match found for path:', fieldPath);
            return true;
          }

          if(comp?._errors && comp._errors.length > 0) {
            console.log("comp._errors", comp._errors)
            return true;
          }

          // Try to match nested form paths
          // If fieldPath is like "dataGrid[0].fieldName", also check for "form.data.dataGrid[0].fieldName"
          if (fieldPath && !fieldPath.startsWith('form.')) {
            const nestedPath = `form.data.${fieldPath}`;
            if (invalidFields.has(nestedPath)) {
              console.log('Nested match found:', fieldPath, '->', nestedPath);
              return true;
            }

            // Also try other common nested patterns
            const altNestedPath = `data.${fieldPath}`;
            if (invalidFields.has(altNestedPath)) {
              console.log('Alt nested match found:', fieldPath, '->', altNestedPath);
              return true;
            }
          }

          // If fieldPath starts with form., try without the form. prefix
          if (fieldPath && fieldPath.startsWith('form.data.')) {
            const simplifiedPath = fieldPath.replace('form.data.', '');
            if (invalidFields.has(simplifiedPath)) {
              console.log('Simplified match found:', fieldPath, '->', simplifiedPath);
              return true;
            }
          }

          // Debug: log when no match is found
          if (fieldPath) {
            console.log('No match found for path:', fieldPath, 'Available paths:', Array.from(invalidFields));
          }

          return false;
        }

        const getInvalidStyle = (comp, path, basePath = '') => {
          // Try different path combinations for better matching
          const pathsToTry = [];

          if (basePath) {
            pathsToTry.push(`${basePath}.${path}`); // basePath.path
            pathsToTry.push(`${basePath}[${path}]`); // basePath[path] for array access

            // Try with form.data. prefix for nested forms
            pathsToTry.push(`form.data.${basePath}.${path}`);
            pathsToTry.push(`form.${basePath}.${path}`);

            // Try with just data. prefix
            pathsToTry.push(`data.${basePath}.${path}`);
          }

          pathsToTry.push(path); // just the path itself

          // Try with form.data. prefix for direct paths
          if (!path.includes('.')) {
            pathsToTry.push(`form.data.${path}`);
            pathsToTry.push(`data.${path}`);
          }

          // If path contains brackets, try variations
          if (path.includes('[')) {
            pathsToTry.push(path.replace(/\[.*?\]/g, '')); // remove array indices
          }

          // Try to find any match
          for (const testPath of pathsToTry) {
            if (isFieldInvalid(comp, testPath)) {
              console.log('✅ Path match found:', testPath, 'from attempts:', pathsToTry);
              return 'background-color:rgb(255 123 123); border-radius: 3px;';
            }
          }

          console.log('❌ No path match found for:', path, 'with basePath:', basePath, 'tried paths:', pathsToTry);
          return '';
        };

        // Helper functions for datagrid highlighting
        const isRowInvalidRecursive = (node, currentPath) => {
          // Check if this node itself is invalid
          if (node.__comp && isFieldInvalid(node.__comp, currentPath)) {
            return true;
          }

          // Recursively check children
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
          console.log("isRowInvalid", row.__children)

          // First try the original logic for direct children
          const hasDirectInvalid = Object.keys(row.__children).some(colKey => {
            const cell = row.__children[colKey];
            const cellPath = `${datagridKey}[${rowIdx}].${colKey}`;
            return isFieldInvalid(cell.__comp, cellPath);
          });
          console.log("hasDirectInvalid", hasDirectInvalid)

          if (hasDirectInvalid) return true;

          // If no direct invalid fields, recursively check nested components
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

        // Check if a container (panel, form, etc.) has any invalid nested components
        const isContainerInvalid = (containerNode, containerKey, containerBasePath) => {
          if (!containerNode) return false;

          // Check if the container itself is invalid
          const containerPath = containerBasePath ? `${containerBasePath}.${containerKey}` : containerKey;
          if (containerNode.__comp && isFieldInvalid(containerNode.__comp, containerPath)) {
            return true;
          }

          // Recursively check all children
          if (containerNode.__children) {
            return Object.keys(containerNode.__children).some(childKey => {
              const childNode = containerNode.__children[childKey];
              const childPath = `${containerPath}.${childKey}`;
              
              // If child is a leaf, check if it's invalid
              if (childNode.__leaf) {
                return childNode.__comp && isFieldInvalid(childNode.__comp, childPath);
              }
              
              // If child is a container, recursively check it
              return isContainerInvalid(childNode, childKey, containerPath);
            });
          }

          // Check rows if it's a datagrid-like container
          if (containerNode.__rows) {
            return Object.keys(containerNode.__rows).some(rowIdx => {
              const row = containerNode.__rows[rowIdx];
              return isRowInvalid(row, containerKey, parseInt(rowIdx));
            });
          }

          return false;
        };

        function formatValue(value, comp) {
          if (value && value._type === 'table' && Array.isArray(comp.table)) {
            const customTableForReview = (component, data = {}) => {
              var label = component.label;
              var key = component.key;
              var rows = component.table || component.components || component.columns;
              var customTable = null;
              var customPanel = null;
              var customColumn = null;
              var rowData = [];
              var value = {};
              var column = [];
              var finalTable = [];
              rows.map((row) => {
                if (Array.isArray(row)) {
                  rowData = [];
                  row.map((col) => {
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
                    if (customTable === null) {
                      customTable = [];
                    }
                    customTable.push({ _row: rowData });
                  }
                }
              });
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
            customTable._row.forEach(rowObj => {
              tableHtml += `<tr>`;
              if (Array.isArray(rowObj._row)) {
                rowObj._row.forEach(colObj => {
                  if (Array.isArray(colObj._row)) {
                    tableHtml += `<td style="border:1px solid #ccc;padding:4px;">`;
                    colObj._row.forEach(cellObj => {
                      if (cellObj._children) {
                        tableHtml += `<strong>${cellObj._children._label}:</strong> ${cellObj._children._value ?? ''}`;
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
            tableHtml += `</table>`;
            return tableHtml;
          }

          if(comp?._type === 'container') console.log("test container", value, comp)

          if (comp?.type === 'survey' || comp?.component?.type === 'survey') {
            let surveyHTML = '<div idx="7" style="padding-left: 10px;">';
            // Use pad and depth for consistent styling
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

          if (comp?.type === 'textarea' || comp?.component?.type === 'textarea') {
            if (value === null || value === undefined || value === '') return '';
            const formattedValue = String(value).replace(/\n/g, '<br/>'); // Preserve line breaks
            // Return special marker for textarea components - flex layout handled in rendering
            return `<div style="display: flex; align-items: flex-start;"><div style="flex: 1;">${formattedValue}</div></div>`;
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
            .filter(seg => !/^\d+\]$/.test(seg) && !/^\d+$/.test(seg));
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
                    __kind: null,
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
                console.log("comp1", comp) 
                if(ptr && ptr[key] && ptr[key].__comp) {
                  ptr[key].__comp = comp;
                  if (ptr[key].__children && typeof ptr[key].__children === 'object') {
                    Object.keys(ptr[key].__children).forEach(childKey => {
                      if (ptr[key].__children[childKey] && !ptr[key].__children[childKey].__comp) {
                        ptr[key].__children[childKey].__comp = comp;
                      }
                    });
                  }
                  console.log("ptr[key]", ptr[key])
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

          console.log("sortedEntries", sortedEntries)
          return sortedEntries.map(([k, v], index) => {
            // Check if this is an Address component for rendering
            const isAddressComponentRender = v.__comp?.component?.type === 'address' || v.__comp?.type === 'address';

            // Debug logging for Address components in rendering
            if (isAddressComponentRender) {
              console.log('Rendering Address component:', k, 'visible:', v.__comp?._visible, 'reviewVisible:', v.__comp?.component.reviewVisible, 'required:', v.__comp?.component.validate?.required);
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
                console.log("v.__children", v)
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
              } else if (val && typeof val === 'string' && val.includes('<div style="display: flex; align-items: flex-start;">')) {
                // Special handling for textarea components with flex layout
                return `<div idx="6" depth="${depth}" style="${pad}; display: flex; align-items: flex-start;">
                          <strong style="${getInvalidStyle(v.__comp, k, basePath)}; margin-right: 8px;">${v.__label || k}:</strong>
                          ${val}
                        </div>`;
              } else {
                return `<div idx="6" depth="${depth}" style="${pad}"><strong style="${getInvalidStyle(v.__comp, k, basePath)}">${v.__label || k}:</strong> ${val}</div>`;
              }
            }

            if (v && typeof v === 'object') {
              if(!v.__label){
                // Try to find the component by key to get its proper label
                const foundComponent = findComponentByKey(rootInstance, k);
                if (foundComponent) {
                  v.__label = foundComponent.component.component?.label || foundComponent.component.label || k;
                  console.log("Found component by key:", k, foundComponent);
                } else {
                  v.__label = k; // Fallback to key if not found
                }
              }

              const hasChildren = v.__children && Object.keys(v.__children).length;
              const hasRows = v.__rows && Object.keys(v.__rows).length;
              const isContainerComponent = 
                  (isContainerType([v.__comp?.component?.type, v.__comp?.type, v.__value?._type]) && 
                   !shouldFlattenContainer([v.__comp?.component?.type, v.__comp?.type, v.__value?._type])) || 
                  Array.isArray(v.__value?._row);

              const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k + " - missing __label") );
              
              
              // Check if this container has invalid fields for highlighting
              let headerStyle = ""
              const header = `<div idx="12" style="${headerStyle}">`;

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
                  panelChildrenHtml = renderNode(artificialChildren, depth + 1, rootInstance, invalidFields, containerPath);
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
                  const componentType = v.__comp?.component?.type || v.__comp?.type;
                  const containerType = componentType 
                    ? componentType.charAt(0).toUpperCase() + componentType.slice(1).replace(/([A-Z])/g, ' $1')
                    : 'Container';
                  if(depth >= 1) {
                    pad += `margin-left: 10px;`;
                  }
                  return `
                    <div idx="17" style="${pad}">
                      <strong style="${getInvalidStyle(v.__comp, k, basePath)}">${displayLabel || containerType}</strong>
                      ${panelChildrenHtml}
                    </div>
                  `;
                }
              }
              else{
                headerStyle += "border-left:1px dotted #ccc;"
              }

              if ((v.__kind === 'datagrid' || v.__kind === 'datatable') && hasRows) {
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

                      if (cell.__leaf) {
                        const val = firstLeafVal(cell);
                        const cellPath = `${k}[${rowIdx}].${colKey}`;
                        cellContent = `<div idx="20" style="${padCol}"><strong style="${getInvalidStyle(cell.__comp, colKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${val}</div>`;
                      } else {
                        // Handle nested content in multi-column case
                        const nestedHtml = renderNode(cell?.__children || {}, depth + 1, rootInstance, invalidFields, `${k}[${rowIdx}].${colKey}`);
                        cellContent = `<div idx="20" style="${padCol}"><strong>${cell.__label || labelByKey.get(colKey) || colKey}:</strong></div>${nestedHtml}`;
                      }
                      return `${cellContent}`;
                    }).filter(html => html.length > 0).join('');
                    colsHtml += colsItems;
                    colsHtml += '</div>';

                    return `<li style="margin-left:15 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${colsHtml}</li>`;
                  } else {
                    const onlyKey = orderedKeys[0];
                    const cell = row.__children[onlyKey];
                    const inner = cell?.__leaf
                      ? `<div idx="21" style="${padRow}"><strong style="${getInvalidStyle(cell.__comp, onlyKey, `${k}[${rowIdx}]`)}">${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong> ${firstLeafVal(cell)}</div>`
                      : renderNode(cell?.__children || {}, depth + 1, rootInstance, invalidFields, `${k}[${rowIdx}].${onlyKey}`);
                    return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}"><strong style="${rowLabelStyle}">Row ${rowIdx + 1}:</strong>${inner}</li>`;
                  }
                }).join('');
                rowsHtml += rowsItems;

                return `${header}<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${rowsHtml}</ul></div>`;
              }

              const childrenHtml = [
                hasRows
                  ? `<ul style="list-style-type:circle; padding-left:30px; margin:0; border-left:1px dotted #ccc;">${Object.entries(v.__rows).map(([i, r]) => {
                    const isTagpad = k === 'tagpad' ||
                      v.__label === 'Tagpad' ||
                      v.__comp?.component?.type === 'tagpad' ||
                      v.__comp?.type === 'tagpad';
                    const rowLabel = isTagpad ? `Tag ${Number(i) + 1}` : `Row ${Number(i) + 1}`;

                    // Check if this row has invalid fields
                    const rowHasErrors = isRowInvalid(r, k, parseInt(i));
                    const rowLabelStyle = rowHasErrors ? 'background-color:rgb(255 123 123); border-radius: 3px;' : '';

                    const hasChildren = r.__children && Object.keys(r.__children).length > 0;
                    const content = hasChildren
                      ? renderNode(r.__children, depth + 1, rootInstance, invalidFields, `${basePath ? basePath + '.' : ''}${k}[${i}]`)
                      : ``;

                    const rowClass = isTagpad ? 'tagpad-row' : 'data-row';

                    return `<li class="${rowClass}" style="margin-left:0 !important; padding-left: 0 !important;"><strong style="${rowLabelStyle}">${rowLabel}:</strong>${content}</li>`;
                  }).join('')
                  }</ul>` : '',
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

      // Collect invalid fields for highlighting
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

      // Also collect fields that have direct _errors on components
      const collectComponentErrors = (component, currentPath = '') => {
        if (!component) return;

        // Check if this component has errors
        if (component._errors && component._errors.length > 0) {
          const compPath = currentPath || component.path || component.key || component.component?.key;
          if (compPath) {
            invalidFields.add(compPath);
            console.log('Added component error path:', compPath);
          }
        }

        // Recursively check child components
        if (component.components && Array.isArray(component.components)) {
          component.components.forEach(child => {
            const childPath = currentPath 
              ? `${currentPath}.${child.key || child.path || 'unknown'}`
              : child.key || child.path || child.component?.key;
            collectComponentErrors(child, childPath);
          });
        }

        // Check rows for datagrids/datatables
        if (component.rows && Array.isArray(component.rows)) {
          component.rows.forEach((row, rowIdx) => {
            if (row && typeof row === 'object') {
              Object.keys(row).forEach(colKey => {
                const cell = row[colKey];
                if (cell && cell.component) {
                  const cellPath = currentPath 
                    ? `${currentPath}[${rowIdx}].${colKey}`
                    : `${component.key || 'datagrid'}[${rowIdx}].${colKey}`;
                  collectComponentErrors(cell.component, cellPath);
                }
              });
            }
          });
        }
      };

      // Collect errors from the root component tree
      collectComponentErrors(this.root);

      // Add parent container paths for any nested invalid fields
      const addParentPaths = (fieldPath) => {
        if (!fieldPath || typeof fieldPath !== 'string') return;
        
        // Split the path and build parent paths
        const parts = fieldPath.split('.');
        let currentPath = '';
        
        for (let i = 0; i < parts.length - 1; i++) {
          if (currentPath) {
            currentPath += '.';
          }
          currentPath += parts[i];
          
          // Remove array indices for container paths
          const cleanPath = currentPath.replace(/\[\d+\]/g, '');
          if (cleanPath && cleanPath !== currentPath) {
            invalidFields.add(cleanPath);
          }
          invalidFields.add(currentPath);
        }
        
        // Also handle array-style paths like "dataGrid[0].field"
        if (fieldPath.includes('[') && fieldPath.includes(']')) {
          const arrayMatch = fieldPath.match(/^([^[]+)\[\d+\]/);
          if (arrayMatch) {
            invalidFields.add(arrayMatch[1]); // Add "dataGrid" from "dataGrid[0].field"
          }
        }
      };

      // Process all collected paths to add their parent containers
      const originalPaths = Array.from(invalidFields);
      originalPaths.forEach(path => {
        addParentPaths(path);
      });

      console.log('Final collected invalid fields:', Array.from(invalidFields));

      // Pass this.root and invalidFields as parameters to renderLeaves
      const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, this.root, invalidFields);

      // Get the latest data after refresh
      const allData = this.root.getValue();
      const supportNumber = allData?.data?.billingCustomer || "Unavailable";

      const modal = document.createElement("div");
      modal.style.zIndex = "1000";
      modal.className =
        "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";

      // Filter out container paths and count only actual field errors
      const allPaths = invalidFields ? Array.from(invalidFields) : [];
      console.log('All invalid paths:', allPaths);

      // Group paths by common prefixes to better understand the structure
      const groupPathsByPrefix = (paths) => {
        const groups = {};

        paths.forEach(path => {
          // Find the common prefix patterns
          if (path.includes('dataGrid[') || path.includes('form.data.dataGrid[')) {
            const prefix = path.includes('form.data.') ? 'form.data.dataGrid' : 'dataGrid';
            if (!groups[prefix]) groups[prefix] = [];
            groups[prefix].push(path);
          } else {
            // Direct fields or other patterns
            const prefix = path.includes('.') ? path.split('.')[0] : 'direct';
            if (!groups[prefix]) groups[prefix] = [];
            groups[prefix].push(path);
          }
        });

        return groups;
      };

      const isFieldPath = (path) => {
        // Common container types that should be excluded
        const containerTypes = ['panel', 'fieldset', 'datagrid', 'datatable', 'container', 'well', 'table', 'tabs', 'columns'];

        // Check if this path represents a known container type
        const pathLower = path.toLowerCase();
        if (containerTypes.some(type => pathLower.includes(type))) {
          // Additional check: if it's just the container name (no dots, no brackets after container type)
          if (!path.includes('.') && !path.includes('[')) {
            return false; // Exclude pure container names like "panel1", "fieldSet"
          }
        }

        // If path has no dots and no brackets, check if it's a real field (not container)
        if (!path.includes('.') && !path.includes('[')) {
          // Known container patterns that appear as direct paths
          const knownContainers = ['panel', 'fieldset', 'panel', 'datagrid', 'datatable', 'container', 'well', 'table', 'tabs', 'columns'];
          if (knownContainers.some(container => pathLower.includes(container))) {
            return false;
          }
          return true; // e.g., "textField", "file"
        }

        // If path contains array index anywhere, it's likely a field (even in nested forms)
        if (path.includes('[') && path.includes(']')) {
          // Check if this ends with a field name after the array index
          const afterBracket = path.split(']').pop();
          if (afterBracket && afterBracket.includes('.') && afterBracket.length > 1) {
            // Like "form.data.dataGrid[0].fieldName" - has field after array index
            return true;
          } else if (afterBracket && !afterBracket.includes('.') && afterBracket.length > 0) {
            // Like "dataGrid[0].textArea" - direct field after array index
            return true;
          } else if (!afterBracket || afterBracket.length === 0) {
            // Like "form.data.dataGrid[0]" - just the array reference, likely a container
            return false;
          }
        }

        // Handle paths with dots but no array indices
        if (path.includes('.') && !path.includes('[')) {
          const parts = path.split('.');
          // If it has exactly 2 parts, it might be a field path like "form.fieldName"
          if (parts.length === 2) {
            return true;
          }
          // More than 2 parts without array indices are likely nested paths or containers
          return false;
        }

        return false; // Default to excluding uncertain cases
      };

      const fieldPaths = allPaths.filter(isFieldPath);
      const groupedPaths = groupPathsByPrefix(allPaths);
      const groupedFieldPaths = groupPathsByPrefix(fieldPaths);

      console.log('=== PATH ANALYSIS ===');
      console.log('All paths:', allPaths);
      console.log('Grouped by prefix:', groupedPaths);
      console.log('Filtered field paths:', fieldPaths);
      console.log('Grouped field paths:', groupedFieldPaths);
      console.log('Excluded container paths:', allPaths.filter(p => !isFieldPath(p)));

      const fieldErrorCount = fieldPaths.length;

      // Check if there are any invalid fields
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

      // Function to validate modal form and update submit button state
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
        if(submitButton && submitButton.style){
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

        // Add event listener for screenshot component changes
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

      // Only set up verified select event listener if the element exists
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

      // Add input event listeners to all form inputs in the modal
      const addInputListeners = (element) => {
        if (!element) return;

        // Add listeners to input, textarea, and select elements
        const inputs = element.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
          input.addEventListener('input', validateModalForm);
          input.addEventListener('change', validateModalForm);
        });

        // Also add listener to the verified select that already exists
        const verifiedSelect = modal.querySelector("#verified");
        if (verifiedSelect) {
          verifiedSelect.addEventListener('input', validateModalForm);
          verifiedSelect.addEventListener('change', validateModalForm);
        }
      };

      // Add listeners to the modal content
      addInputListeners(modal);

      // Only set up submit button event listener if the element exists
      const submitButton = modal.querySelector("#submitModal");
      submitButton.style.backgroundColor = "gray";
      submitButton.style.cursor = "not-allowed";
      submitButton.disabled = true;
      if (submitButton) {
        submitButton.onclick = async () => {
          // Run validation before submitting
          validateModalForm();

          // Check if there are still errors after validation
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

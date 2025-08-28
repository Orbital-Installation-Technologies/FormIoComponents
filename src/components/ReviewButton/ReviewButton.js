import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

const FieldComponent = Components.components.field;

/**
 * Helper function to check if a component type is a container type
 * @param {string} t - The component type to check
 * @returns {boolean} True if the component is a container type
 */
const isContainerType = (t) => ['panel', 'container', 'columns', 'well', 'dataMap', 'fieldset', 'table', 'tabs'].includes(t);

/**
 * ReviewButton Component for Form.io
 * Handles form validation and submission review functionality
 */
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

    // Refresh page after successful submission
    this.root.on("submitDone", () => {
      window.location.reload();
    });

    if (this.root) {
      // Register validation methods on the root form
      this.registerFormValidationMethods();

      // Setup validation event handler
      this.setupValidationEventHandler();

      // Expose validation methods to window for external access
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

      // Validate each component
      this.root.everyComponent(component => {
        if (component.checkValidity) {
          const valid = component.checkValidity(component.data, true);
          if (!valid) {
            isValid = false;
            component.setCustomValidity(component.errors, true);
          }
        }
      });

      // Redraw the form to show validation messages
      this.root.redraw();

      // Scroll to the first error if validation failed
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
   * Thorough form validation that marks all components as dirty
   * @returns {Promise<boolean>} Whether the form is valid
   */
  async validateFormHard() {
    try {
      // Mark all components as dirty
      this.markAllComponentsAsDirty();

      // Get form data and validate
      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      let isValid = true;

      if (typeof this.root?.checkValidity === 'function') {
        isValid = this.root.checkValidity(data, true);
      }

      // Show errors and redraw
      if (!isValid && typeof this.root?.showErrors === 'function') {
        this.root.showErrors();
      }

      if (typeof this.root?.redraw === 'function') {
        await this.root.redraw();
      }

      // Special handling for datagrid components
      this.markDatagridRowsAsDirty();

      // Scroll to first error if validation failed
      if (!isValid) {
        this.scrollToFirstErrorAdvanced();
      }

      return !!isValid;
    } catch (e) {
      return false;
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
      // Initialize results object
      const results = this.initializeValidationResults();

      // Find components to validate
      const componentsToValidate = this.findComponentsToValidate(keys);

      // Validate each component
      await this.validateSelectedComponents(componentsToValidate, results, opts);

      // Handle UI updates (show errors and scroll)
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

      // Mark component as dirty for validation
      this.markComponentAsDirty(component);

      // Validate the component
      const isValid = component.checkValidity ? component.checkValidity(component.data, true) : true;

      // Record results
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
    // Always record result
    results.fieldResults[key] = {
      isValid,
      errors: component.errors || [],
      label,
      path
    };

    // If invalid, record error information
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

      // Show validation errors on the component if needed
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
    // Redraw the form to show validation errors
    if (typeof this.root?.redraw === 'function') {
      await this.root.redraw();
    }

    // Scroll to first invalid component if needed
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
      // Get form data
      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      let isValid = true;

      // Check each visible and enabled component
      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            // Only validate components that are visible and not disabled
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
      // Initialize results object
      const results = this.initializeExternalValidationResults();

      // Mark all components as dirty for validation
      this.markAllComponentsAsDirty();

      // Get form data
      const data = this.root?.submission?.data ?? this.root?.data ?? {};

      // Maps to store errors and warnings
      const errorMap = new Map();
      const warningMap = new Map();

      // Validate all visible and enabled components
      if (this.root?.everyComponent) {
        await this.validateComponentsAndCollectResults(errorMap, warningMap, results, opts);
      }

      // Convert maps to objects for the results
      results.errors = Object.fromEntries(errorMap);
      results.warnings = Object.fromEntries(warningMap);

      // Generate error summary text
      this.generateErrorSummary(errorMap, results);

      // Handle UI updates if needed
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
        // Skip invisible or disabled components
        if (!component.visible || component.disabled) return;

        if (component.checkValidity) {
          // Validate the component
          const isValid = component.checkValidity(component.data, true);

          // Process errors if validation failed
          if (!isValid) {
            this.processComponentErrors(component, errorMap, results, opts.showErrors);
          }

          // Process warnings if requested
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
    // Mark form as invalid and increment error count
    results.isValid = false;
    results.errorCount++;

    // Get component identification info
    const componentKey = component.key || component.path;
    const componentLabel = component.component?.label || componentKey;
    const componentPath = component.path || componentKey;

    // Collect errors
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

    // Track invalid components
    results.invalidComponents.push({
      component,
      path: componentPath,
      label: componentLabel
    });

    // Show validation errors if requested
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
    // Increment warning count
    results.warningCount += component.warnings.length;

    // Get component identification info
    const componentKey = component.key || component.path;
    const componentLabel = component.component?.label || componentKey;
    const componentPath = component.path || componentKey;

    // Initialize warning container for this component
    if (!warningMap.has(componentPath)) {
      warningMap.set(componentPath, {
        label: componentLabel,
        warnings: []
      });
    }

    // Collect warnings
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
    // Redraw the form to show validation errors
    if (typeof this.root?.redraw === 'function') {
      await this.root.redraw();

      // Show errors if validation failed
      if (!results.isValid && typeof this.root?.showErrors === 'function') {
        this.root.showErrors();
      }

      // Scroll to first error if requested
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

    // Validate the form
    const results = await this.validateFormExternal({
      showErrors: opts.showErrors,
      scrollToError: opts.scrollToError,
      includeWarnings: true
    });

    // Display error summary if requested and there are errors
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
    // Create error summary element
    const errorSummaryEl = this.createErrorSummaryElement();

    // Generate error summary content
    errorSummaryEl.innerHTML = this.generateErrorSummaryContent(results);

    // Add to document
    document.body.appendChild(errorSummaryEl);

    // Setup close button handler
    this.setupErrorSummaryCloseButton(errorSummaryEl);

    // Auto-dismiss after 10 seconds
    this.setupErrorSummaryAutoDismiss(errorSummaryEl);
  }

  /**
   * Create the error summary element with styles
   * @returns {HTMLElement} Styled error summary element
   */
  createErrorSummaryElement() {
    const errorSummaryEl = document.createElement('div');
    errorSummaryEl.className = 'alert alert-danger validation-summary';

    // Apply styles
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
    // Generate list items for each error
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
      // Small delay to ensure all UI updates are complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Collect all datagrids and datatables, with safety check
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

      // Update values in all datagrid and datatable components
      for (const datagrid of allDatagrids) {
        try {
          this.updateDatagridValues(datagrid);
        } catch (e) {
          console.error("Error updating datagrid/datatable values:", e);
        }
      }

      // Update values in top-level components
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
    // Update the datagrid/datatable value
    if (datagrid && datagrid.updateValue && typeof datagrid.updateValue === 'function') {
      try {
        datagrid.updateValue();
      } catch (e) {
        console.error("Error updating datagrid value:", e);
      }
    }

    // For datatables, update values in each saved row
    if (datagrid && datagrid.component?.type === 'datatable' && Array.isArray(datagrid.savedRows)) {
      datagrid.savedRows.forEach(row => {
        if (row && Array.isArray(row.components)) {
          row.components.forEach(component => {
            this.safelyUpdateComponent(component, 'datatable row component');
          });
        }
      });
    }
    // For datagrids, update values in each row
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

    // Skip components that might cause issues
    if (component.type === 'select' && (!component.choices || !Array.isArray(component.choices))) {
      console.warn(`Skipping Select component update in ${context} - missing choices array`);
      return;
    }

    // Only call updateValue if it exists and is a function
    if (component.updateValue && typeof component.updateValue === 'function') {
      try {
        // Ensure all required properties exist before calling updateValue for select components
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
      // Validate the form
      const validation = await this.validateFormExternal({
        showErrors: true,
        scrollToError: true
      });

      // If validation fails, show error and exit
      // if (!validation.isValid) {
      //   if (validation.errorCount > 0) {
      //     alert(`Please fix the following errors before proceeding:\n\n${validation.errorSummary}`);
      //   }
      //   return false;
      // }

      // Update all form values to ensure latest data
      try {
        await this.updateFormValues();
      } catch (e) {
        console.error("Error updating form values:", e);
        // Continue with the review process even if some updates fail
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
    // Load reference to button
    this.loadRefs(element, { button: "single" });

    // Add click event listener to button
    this.addEventListener(this.refs.button, "click", async () => {

      // if (!validation.isValid) {
      //   if (validation.errorCount > 0) {
      //     alert(`Please fix the following errors before proceeding:\n\n${validation.errorSummary}`);
      //   }
      //   return;
      // }

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

        // Extract basic component info
        const label = component.component?.label || component.label || component.key || 'Unnamed';
        const key = component.component?.key || component.key;
        const componentType = component.component?.type || component.type;
        const data = component.data || component._data || component.dataValue || {};
        const rootInstance = component.root || component.parent?.root || null;

        // Different handling based on component type
        if (componentType === 'table' || componentType === 'datatable') {
          // Process table and datatable components the same way

          // Get column definitions
          const colDefs = Array.isArray(component.components) ? component.components : [];
          const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
          const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

          // Get data rows
          let dataRows = [];
          const componentPath = component.path || component.key || '';
          // Prefer comp.table if present and is an array of arrays
          if (Array.isArray(component.table) && component.table.length > 0 && Array.isArray(component.table[0])) {
            // Convert array of arrays to array of objects using column keys
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
            // For both table and datatable, try to get rows from multiple sources
            dataRows = Array.isArray(component.dataValue) ? component.dataValue :
              Array.isArray(component.rows) ? component.rows :
                Array.isArray(component.savedRows) ? component.savedRows.map(row => row.data || {}) :
                  Array.isArray(rootInstance?.data?.[key]) ? rootInstance.data[key] :
                    Array.isArray(component._data?.[key]) ? component._data[key] : [];
          }

          // Process rows
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

              // Get value from row data
              const val = typeof rowObj === 'object' ? rowObj[colKey] : '';

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
  
          return {
            _label: label,
            _key: key,
            _type: componentType,
            _row: tableRows
          };
        } else if (['panel', 'container', 'well', 'fieldset', 'columns', 'tabs', 'table'].includes(componentType)) {
          // Handle panel, container, well and similar container components
          const children = component.components || [];
          const containerItems = children.filter(child => {
            // Only include children that have reviewVisible explicitly set to true
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

        // Default case for other component types
        return {
          _label: label,
          _key: key,
          _type: componentType,
          _leaf: true,
          _value: component.dataValue || ''
        };
      };



      // Collect reviewVisible leaves and container labels
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

        // ----- map top-level component key -> index (true render order)
        const topIndexMap = new Map();
        if (Array.isArray(root?.components)) {
          root.components.forEach((c, i) => {
            const k = c?.component?.key || c?.key;
            if (k) topIndexMap.set(k, i);
          });
        }
        // walk up to the top-level ancestor (direct child of root)
        const topIndexFor = (comp) => {
          let p = comp;
          while (p?.parent && p.parent !== root) p = p.parent;
          const topKey = p?.component?.key || p?.key;
          return topIndexMap.has(topKey) ? topIndexMap.get(topKey) : -1;
        };

        if (root.ready) await root.ready;
        // Create containers for storing component data
        let leaves = [];  // Changed to 'let' to avoid redeclaration
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

          // queue all components for processing
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

          console.log("comp", comp);

           if (comp?._visible == false || (!comp?.component.reviewVisible && !comp?.component.validate.required)) continue;

          if (isContainerType(comp.component?.type) && Array.isArray(comp.rows) && comp.rows.length) {

            const dataMapPath = safePath(comp);
            labelByPathMap.set(dataMapPath, comp.component?.label || comp.key);
            indexByPathMap.set(dataMapPath, topIndexFor(comp));

            comp.rows.forEach((row, rIdx) => {
              // For DataMap, each row is an object with __key and value components
              const keyComp = row.__key;
              const valueComp = row.value;

              // Get key and value
              const key = keyComp ? (keyComp.getValue ? keyComp.getValue() : keyComp.dataValue) : '';
              const value = valueComp ? (valueComp.getValue ? valueComp.getValue() : valueComp.dataValue) : '';

              // Push key leaf
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
            labelByPathMap.set(formContainerPath, containerTitle);
            indexByPathMap.set(formContainerPath, topIndexFor(comp));

            if (comp.subForm) {
              // << NEW: prefix all subform descendants with the parent form key
              comp.subForm.__reviewPrefix = comp.path ? `${formContainerPath}.` : '';
              enqueueAll(comp.subForm);
            } else {
              if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
                labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'List');
                indexByPathMap.set(comp.path, topIndexFor(comp));
              } else {
                labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'Form');
                indexByPathMap.set(comp.path, topIndexFor(comp));
              }
            }
            continue;
          }

          if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
            const gridPath = safePath(comp); // << NEW
            labelByPathMap.set(gridPath, comp.component?.label || comp.key || 'List');
            indexByPathMap.set(gridPath, topIndexFor(comp));

            // Column defs in schema order; include containers (Panel/Container/Columns) too.
            let colDefs = Array.isArray(comp.components) ? comp.components : [];
            const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
            const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');

            metaByPathMap.set(gridPath, {
              kind: comp.component?.type === 'datatable' ? 'datatable' : 'datagrid',
              columnKeys,
              columnLabels
            });

            // Helper: flatten a cell's component tree into leaf fields under the correct column path.
            const pushValueLeaf = (node, basePath) => {
              pushLeaf({
                comp: node,
                path: basePath,
                label: node.component?.label || node.label || node.key || 'Value',
                value: ('getValue' in node) ? node.getValue() : node.dataValue,
                formIndex: topIndexFor(node)
              });
            };
            const flattenCell = (node, basePath) => {
              if (!node) return;
              const t = node.component?.type || node.type;

              // Nested Form inside a cell
              if (t === 'form' && node.subForm) {
                node.subForm.__reviewPrefix = `${basePath}.`;
                // Walk subform inputs
                node.subForm.everyComponent?.((ch) => {
                  const chPath = `${basePath}.${ch.path || ch.key || 'value'}`;
                  if (isContainerType(ch.component?.type || ch.type)) {
                    flattenCell(ch, chPath);
                  } else {
                    pushValueLeaf(ch, chPath);
                  }
                });
                return;
              }

              // Columns layout
              if (t === 'columns' && Array.isArray(node.columns)) {
                node.columns.forEach((col, ci) => {
                  (col.components || []).forEach((ch) => {
                    const chPath = `${basePath}.${ch.key || ch.path || `col${ci}`}`;
                    flattenCell(ch, chPath);
                  });
                });
                return;
              }

              // Generic containers (Panel/Container/etc.)
              if (isContainerType(t) && Array.isArray(node.components)) {
                node.components.forEach((ch) => {
                  const chPath = `${basePath}.${ch.key || ch.path || 'value'}`;
                  flattenCell(ch, chPath);
                });
                return;
              }

              // Leaf input
              pushValueLeaf(node, basePath);
            };

            // ---- DATATABLE: read from arrays (already worked); keep your existing datatable code if you like.
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
                  const cKey = c.key || c.component?.key;
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

            // ---- DATAGRID: recurse into container columns so inner fields show up
            if (Array.isArray(comp.rows) && comp.rows.length) {
              comp.rows.forEach((row, rIdx) => {
                Object.entries(row).forEach(([colKey, cellComp]) => {
                  const base = `${gridPath}[${rIdx}].${colKey}`;
                  flattenCell(cellComp, base); // << NEW: digs through Panel/Container/Columns/Form
                });
              });
            }
            continue;
          }

          if ((comp.component?.type === 'datagrid' && !comp.rows) ||
            (comp.component?.type === 'datatable' && !comp.savedRows)) {
            // Ensure datagrid/datatable labels are set even if rows are absent
            labelByPathMap.set(safePath(comp), comp.component?.label || comp.key || 'List');
            continue;
          }

          // Handle EditGrid
          if (comp.component?.type === 'editgrid' && Array.isArray(comp.editRows) && comp.editRows.length) {
            const gridPath = safePath(comp);
            labelByPathMap.set(gridPath, comp.component?.label || comp.key || 'Items');
            indexByPathMap.set(gridPath, topIndexFor(comp));

            comp.editRows.forEach((r, rIdx) => (r.components || []).forEach((ch) => {
              ch.__reviewPath = `${gridPath}[${rIdx}].${ch.key || 'value'}`;
              queue.push(ch);
            }));
            continue;
          }

          // Handle Table
          if (comp.component?.type === 'table') {
            const tablePath = safePath(comp) || comp.key;
            labelByPathMap.set(tablePath, comp.component?.label || comp.label || comp.key || 'Table');
            indexByPathMap.set(tablePath, topIndexFor(comp));

            // Only push if not already present
            if (!pushedPaths.has(canon(tablePath))) {
              pushLeaf({
                comp: comp,
                path: tablePath,
                label: comp.component?.label || comp.label || comp.key || 'Table',
                value: customComponentForReview(comp),
                formIndex: topIndexFor(comp)
              });
            }
            // Also push leaves for each inner field, with path table.fieldname
            if (Array.isArray(comp.components)) {
              comp.components.forEach(child => {
                const childKey = child.key || child.path || '';
                const childPath = `${tablePath}.${childKey}`;
                labelByPathMap.set(childPath, child.component?.label || child.label || childKey);
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

          // ---- Tagpad (fix: expand editForms -> fields)
          if (comp.component?.type === 'tagpad') {
            // Tagpad container label
            const tagpadPath = safePath(comp);
            labelByPathMap.set(tagpadPath, comp.component?.label || comp.key || 'Tagpad');

            const forms = Array.isArray(comp.editForms) ? comp.editForms : [];
            const tagpadArray = Array.isArray(comp._data?.tagpad) ? comp._data.tagpad : [];

            // Store the form index for the tagpad component
            const formIndex = topIndexFor(comp);

            // Create at least one empty form entry if there are no forms
            if (forms.length === 0) {
              // Even if no forms exist, still create an entry to make sure the tag pad shows up
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
                labelByPathMap.set(basePath, formLabel);
                indexByPathMap.set(basePath, formIndex);  // Ensure form index is set for the tagpad path

                // Prefer the edit form's data; fall back to the tagpad array slot
                const formData = (form && form.data) ? form.data : (tagpadArray[idx] || {});
                const formComps = Array.isArray(form?.components) ? form.components : [];

                // If no components in this form, still add an empty entry to make the tag visible
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

                    // Value: use editForm.data first, then component value
                    let val = (formData && Object.prototype.hasOwnProperty.call(formData, key))
                      ? formData[key]
                      : ('getValue' in ch ? ch.getValue() : (ch.dataValue ?? ''));

                    leaves.push({
                      comp: ch,
                      path: `${basePath}.${key}`,
                      label: ch.component?.label || ch.label || key,
                      value: val,
                      formIndex: formIndex  // Pass the tagpad's form index to all child components
                    });
                  });
                }
              });
            }

            // Don't traverse comp.components for tagpad to avoid duplicates
            continue;
          }

          if (Array.isArray(comp.components) && comp.components.length) {
            const containerPath = safePath(comp);
            const containerLabel = comp.component?.label || comp.key || '';

            // Special handling for components with children - make sure they're marked for review
            const isContainer = comp.component?.type === 'panel' ||
              comp.component?.type === 'container' ||
              comp.component?.type === 'columns' ||
              comp.component?.type === 'fieldset' ||
              comp.component?.type === 'well' ||
              comp.component?.type === 'tabs' ||
              comp.component?.type === 'fieldset' ||
              comp.component?.type === 'dataMap' ||
              comp.component?.type === 'table';

            if (isContainer) {


              // Force container components to be included in review
              if (!comp.component) {
                comp.component = {};
              }
              //comp.component.reviewVisible = true;
            }

            labelByPathMap.set(containerPath, containerLabel);
            indexByPathMap.set(containerPath, topIndexFor(comp));
            comp.components.forEach((ch) => queue.push(ch));
            continue;
          }

          const parent = comp?.parent;
          const parentType = parent?.component?.type;
          const parentIsHandled =
            parentType === 'datatable' ||
            parentType === 'datagrid' ||
            parentType === 'editgrid' ||
            parentType === 'tagpad' ||
            parentType === 'dataMap' ||
            parentType === 'panel' ||
            parentType === 'well' ||
            parentType === 'table' ||
            parentType === 'tabs' ||
            parentType === 'fieldset' ||
            parentType === 'columns';

          // Check if component is inside a TagPad form
          const isInTagpadForm =
            parent && parentType === 'tagpad' &&
            comp.__reviewPath && comp.__reviewPath.includes('[') && comp.__reviewPath.includes(']');

          // Always include Tagpad components regardless of visibility
          const isTagpadComponent = comp.type === 'tagpad' || comp.component?.type === 'tagpad' || isInTagpadForm;

          // Skip content and htmlelement components
          const isContentComponent =
            comp?.component?.type === 'content' ||
            comp?.component?.type === 'htmlelement' ||
            comp?.component?.type === 'dataMap' ||
            comp?.component?.type === 'tabs' ||
            comp?.component?.type === 'columns' ||
            comp?.component?.type === 'fieldset' ||
            comp?.type === 'content' ||
            comp?.type === 'dataMap' ||
            comp?.type === 'htmlelement' ||
            comp?.type === 'tabs' ||
            comp?.type === 'columns' ||
            comp?.type === 'fieldset';

          // Extra check to ensure we don't get duplicate fields from datatables/datagrids
          const componentPath = safePath(comp);
          const pathParts = (componentPath || '').split('.');
          const hasArrayNotation = componentPath && componentPath.includes('[') && componentPath.includes(']');
          const isGridChild = hasArrayNotation || pathParts.some(part => /^\d+$/.test(part));

          // Check if this is a form or panel component
          const isFormComponent = comp.type === 'form' || comp.component?.type === 'form';
          const isPanelComponent = comp.type === 'panel' || comp.component?.type === 'panel';

          // Debug panel components
          if (isPanelComponent) {

          }

          // Log form component info
          if (isFormComponent) {

          }

          // Process panel components specifically
          if (isPanelComponent) {
            // Set the label for the panel in the label map
            const panelPath = safePath(comp);
            labelByPathMap.set(panelPath, comp.component?.label || comp.key || 'Panel');
            indexByPathMap.set(panelPath, topIndexFor(comp));

            // Force panel components to be included in review, regardless of reviewVisible setting
            if (!comp.component) {
              comp.component = {};
            }
            //comp.component.reviewVisible = true;



            // Make sure all child components of the panel are also included
            if (Array.isArray(comp.components) && comp.components.length > 0) {
              // Force reviewVisible on ALL child components of panels
              comp.components.forEach(child => {
                if (!child.component) {
                  child.component = {};
                }
                //child.component.reviewVisible = true;

              });
            }
          }

          // Check if this is a container component that should be included
          const isContainerComponent = comp.component?.type === 'panel' ||
            comp.component?.type === 'container' ||
            comp.component?.type === 'columns' ||
            comp.component?.type === 'fieldset' ||
            comp.component?.type === 'tabs' ||
            comp.component?.type === 'dataMap' ||
            comp.component?.type === 'well' ||
            comp.component?.type === 'table';

          // Debug well components specifically
          if (comp.component?.type === 'well' || comp.type === 'well' ||
            comp.component?.type === 'table' || comp.type === 'table') {
              
            // Process the well component using our new helper function
            const processedWell = customComponentForReview(comp);
          }
          
          // Always process and include panel components regardless of reviewVisible setting
          if (isPanelComponent || isContainerComponent) {
            // Force container components to be included in review
            if (!comp.component) comp.component = {};
            comp.component.reviewVisible = true;

            // Process any container component using our helper function
            if (comp.components && comp.components.length > 0) {
              const processedContainer = customComponentForReview(comp);

            }
          }

          // Only push generic leaves if parent is NOT a handled container and not part of grid data
          if (
            !parentIsHandled &&
            !isContentComponent &&
            !isGridChild &&
            comp.visible !== false &&
            (comp.component?.reviewVisible === true || comp?.component.validate.required || isTagpadComponent || isFormComponent || isPanelComponent || isContainerComponent)
          ) {
            // For form or panel components, ensure we include them and their data
            let componentValue;
            if (isFormComponent) {
              componentValue = comp.data || comp.submission?.data || comp.dataValue || {};
            } else if (isPanelComponent || isContainerComponent) {
              // For container components, use our custom processing function
              const customStructure = customComponentForReview(comp);
              componentValue = customStructure; // Use the custom structured format
            } else {
              componentValue = ('getValue' in comp) ? comp.getValue() : comp.dataValue;
            }

            pushLeaf({
              comp: comp,
              path: comp.__reviewPath || safePath(comp) || comp.key,
              label: comp.component?.label || comp.key,
              value: componentValue,
              formIndex: topIndexFor(comp),
              customStructure: isPanelComponent || isContainerComponent ? true : false
            });

            // Log what we're pushing for form components
            if (isFormComponent) {

            }
          }
        }
        // Make sure all panel and well components are included
        if (Array.isArray(root?.components)) {
          root.components.forEach(comp => {
            const isPanelOrWell =
                          (
                            comp.component?.type === 'panel' || comp.type === 'panel' ||
                            comp.component?.type === 'well' || comp.type === 'well' ||
                            comp.component?.type === 'fieldset' || comp.type === 'fieldset' ||
                            comp.component?.type === 'columns' || comp.type === 'columns' ||
                            comp.component?.type === 'tabs' || comp.type === 'tabs'
                          ) &&
                          Array.isArray(comp.components) && comp.components.length > 0;

            if (isPanelOrWell) {

              // Check if this panel/well is already in leaves
              let panelPath = safePath(comp);
              const containerType = comp.component?.type || comp.type;
              const isWell = containerType === 'well';


              const panelInLeaves = leaves.some(leaf =>
                (leaf.path === panelPath || leaf.comp === comp)
              );

              if (!panelInLeaves) {
                if (panelPath == "") {
                  panelPath = comp.key;
                }



                // Add the panel component to leaves
                const panelFormIndex = topIndexFor(comp);
                labelByPathMap.set(panelPath, comp.component?.label || comp.key || 'Panel');
                indexByPathMap.set(panelPath, panelFormIndex);

                // Determine container type (panel or well)
                const containerType = comp.component?.type || comp.type;
                const isWell = containerType === 'well';
                const containerLabel = comp.component?.label || comp.key || (isWell ? 'Well' : 'Panel');

                // Add the panel/well to leaves
                pushLeaf({
                  comp: comp,
                  path: panelPath,
                  label: containerLabel,
                  value: isWell ? '(Well contents)' : '(Panel contents)',
                  formIndex: panelFormIndex
                });

                // Also make sure child components are included
                comp.components.forEach(childComp => {

                  const childKey = childComp.key || childComp.path || 'child';
                  const childPath = `${panelPath}.${childKey}`;
                  labelByPathMap.set(childPath, childComp.component?.label || childComp.key);
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

        // Update statistics for final log
        stats.leafComponents = leaves.length;
        stats.containers = labelByPathMap.size;

        // Collection complete

        // Log specific component stats
        const dataGridStats = {
          count: 0,
          paths: []
        };
        const dataTableStats = {
          count: 0,
          paths: []
        };

        metaByPathMap.forEach((value, key) => {
          if (value.kind === 'datagrid') {
            dataGridStats.count++;
            dataGridStats.paths.push(key);
          } else if (value.kind === 'datatable') {
            dataTableStats.count++;
            dataTableStats.paths.push(key);
          }
        });



        return { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath };
      }

      // Build readable HTML tree using labels
      function renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, rootInstance) {
        // Specifically check for well components in leaves
        // if (v.__comp?._visible == false || v.__comp?.component.reviewVisible == false) {
        //   return '';
        // }

        // Sort leaves based on their original position in form.components
        const sortedLeaves = [...leaves].sort((a, b) => {
          // Check if either is a panel or well component
          const isPanelA = a.comp?.component?.type === 'panel' || a.comp?.type === 'panel';
          const isPanelB = b.comp?.component?.type === 'panel' || b.comp?.type === 'panel';
          const isWellA = a.comp?.component?.type === 'well' || a.comp?.type === 'well';
          const isWellB = b.comp?.component?.type === 'well' || b.comp?.type === 'well';

          // Treat both panel and well as container components
          const isContainerA = isPanelA || isWellA;
          const isContainerB = isPanelB || isWellB;

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

        // pretty-print values (files, arrays, booleans, etc.)
        function formatValue(value, comp) {
          // Custom table for review implementation
          if (value && value._type === 'table' && Array.isArray(comp.table)) {
            // Use customTableForReview to process the table structure
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
            // Generate the custom table structure
            const customTable = customTableForReview(comp, comp.data || {});
            // Render as HTML table
            let tableHtml = `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">`;
            // Render rows
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



          if (comp?.type === 'survey' || comp?.component?.type === 'survey') {
            let surveyHTML = '<div style="padding-left: 10px;">';
            // Use pad and depth for consistent styling
            const padStyle = typeof pad !== 'undefined' ? pad : '';
            const depthLevel = typeof depth !== 'undefined' ? depth : 0;
            comp.component.questions.forEach((question, index) => {
              if (value[question.value]) {
                surveyHTML += `<div style="${padStyle}margin-left:${(depthLevel + 1) * 15}px; padding-left: 10px; border-left:1px dotted #ccc;">
                                <strong>${question.label}:</strong> ${String(comp.component?.values[index].label)}
                              </div>`;
              } else {
                surveyHTML += `<div style="${padStyle}margin-left:${(depthLevel + 1) * 15}px; padding-left: 10px; border-left:1px dotted #ccc;">
                                <strong>${question.label}:</strong>
                              </div>`;
              }
            });
            surveyHTML += `</div>`;
            return surveyHTML;
          }

          // Other containers
          if (value && value._type && (value._type === 'panel' || value._type === 'well' ||
            value._type === 'container' || value._type === 'fieldset' || value._type === 'columns')) {
            return `(${value._type} data)`;
          }
          // Other custom structures
          if (value && value._label && typeof value._row === 'object') {
            return `(${value._type || 'Container'} data)`;
          }

          // Handle form component values differently
          if (comp?.type === 'form' || comp?.component?.type === 'form') {
            // For form components, just indicate it's a form (actual fields rendered separately)
            return '(Form data)';
          }

          const isFileish =
            comp?.component?.type === 'file' ||
            comp?.component?.type === 'image' ||
            comp?.component?.storage ||
            comp?.component?.filePattern;

          // Handle signature components
          if (comp?.component?.type === 'signature') {
            return value ? 'Signed' : 'Not Signed';
          }

          // Handle tagpad directly - with simpler processing to avoid recursion
          if (comp?.type === 'tagpad' || (comp?.parent?.type === 'tagpad' && comp?.parent?.component?.type === 'tagpad')) {
            // For simple values, just return as is
            if (typeof value !== 'object' || value === null) {
              return value ?? '';
            }
            // For objects or arrays, convert to string directly
            try {
              if (Array.isArray(value)) {
                return value.join(', ');
              } else if (typeof value === 'object') {
                // For objects, try to extract a useful representation
                return String(value?.value || value?.data || value?.text ||
                  Object.values(value)[0] || JSON.stringify(value));
              }
            } catch (e) {
              console.warn('Error formatting tagpad value:', e);
            }
            // Default fallback
            return String(value);
          }

          if (comp?.component?.type === 'selectboxes') {
            if (value && typeof value === 'object' && Object.values(value).some(v => typeof v === 'boolean')) {
              const selected = Object.keys(value).filter(k => value[k] === true);
              return selected.join(', ');
            }
          }

          if (Array.isArray(value)) {
            if (isFileish && value.length && typeof value[0] === 'object') {
              const names = value.map(v => v?.originalName || v?.name || v?.fileName || v?.path || '[file]');
              return names.join(', ');
            }
            return value.join(', ');
          }

          if (value && typeof value === 'object') {
            if (isFileish) return value.originalName || value.name || value.fileName || '[file]';
            try { return JSON.stringify(value); } catch { return String(value); }
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

        // Track paths we've already processed in the tree to avoid duplicates
        const processedTreePaths = new Set();

        // Log entire form structure to help debugging


        // Pre-process all panel components to ensure they're properly included
        const panelComponents = sortedLeaves.filter(leaf =>
          leaf.comp?.component?.type === 'panel' ||
          leaf.comp?.type === 'panel' ||
          leaf.comp?.component?.type === 'well' ||
          leaf.comp?.type === 'well' ||
          leaf.comp?.component?.type === 'table' ||
          leaf.comp?.type === 'table' ||
          (leaf.comp?.components?.length > 0 && (
            leaf.comp?.component?.type === 'container' ||
            leaf.comp?.component?.type === 'columns' ||
            leaf.comp?.component?.type === 'fieldset' ||
            leaf.comp?.component?.type === 'well' ||
            leaf.comp?.component?.type === 'table'
          ))
        );



        // If no panels were found in sortedLeaves but they exist in the form, log this info
        if (panelComponents.length === 0) {

        }

        // First, organize components by parent-child relationships
        const componentsByParentPath = {};
        const isParentComponent = (comp) => {
          return comp?.component?.type === 'panel' ||
            comp?.type === 'panel' ||
            comp?.type === 'container' ||
            comp?.type === 'columns' ||
            comp?.type === 'tabs' ||
            comp?.component?.type === 'container' ||
            comp?.component?.type === 'columns' ||
            comp?.component?.type === 'tabs' ||
            comp?.component?.type === 'fieldset' ||
            comp?.component?.type === 'well' ||
            comp?.type === 'well';
        };

        // First pass - identify all panel components
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

        // ---- build tree from leaf paths
        for (const { path, label, value, comp, formIndex } of sortedLeaves) {
          // Create a normalized version of the path for de-duplication
          const normalizedPath = path.replace(/\.data\./g, '.')
            .replace(/^data\./, '')
            .replace(/^form\./, '')
            .replace(/^submission\./, '');

          // Skip if we've already processed this path in the tree
          if (processedTreePaths.has(normalizedPath)) {

            continue;
          }

          // Special handling for panel components to ensure they're properly included
          const isPanelComponent = isParentComponent(comp);
          if (isPanelComponent) {


            // Ensure we've properly identified this as a panel in our map
            panelPaths.add(normalizedPath);
          }

          processedTreePaths.add(normalizedPath);

          // Check if this path is a child of any panel component
          let isChildOfPanel = false;
          let parentPanelPath = '';

          if (!isPanelComponent) {
            // Check if this component is a child of a panel
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
            // ignore tokens like "0]" (already handled by [idx]) AND bare "0"
            .filter(seg => !/^\d+\]$/.test(seg) && !/^\d+$/.test(seg));
          let ptr = root;
          let containerPath = '';

          // Check if this is a panel component at the root level
          const isPanelAtRoot = parts.length === 1 && isParentComponent(comp);

          for (let i = 0; i < parts.length; i++) {
            const seg = parts[i];
            if (!seg) {
              console.warn('Empty segment found in path parts:', parts);
              continue; // Skip empty segments
            }

            const idxMatch = seg.match(/\[(\d+)\]/);
            const key = seg.replace(/\[\d+\]/g, '');

            // Skip if key is empty after processing
            if (!key) {
              console.warn('Empty key after processing segment:', seg);
              continue;
            }

            containerPath = containerPath ? `${containerPath}.${key}` : key;

            // Special debug for panel child components
            if (isChildOfPanel && i === parts.length - 1) {

            }

            try {
              // Ensure we have a valid node for this key
              // Pass comp as compRef so root-level nodes get __comp
              const node = ensureNode(ptr, key, comp);

              if (!node) {
                console.error('Failed to create node for key:', key);
                continue;
              }

              if (suppressLabelForKey.has(key)) node.__suppress = true;
              setNodeLabelForPath(node, containerPath);
              setNodeMetaForPath(node, containerPath);
              setNodeIndexForPath(node, containerPath);            // Store formIndex for sorting
              if (formIndex >= 0 && (node.__formIndex === -1 || formIndex < node.__formIndex)) {
                node.__formIndex = formIndex;
              }

              if (idxMatch) {
                const idx = Number(idxMatch[1]);
                // Ensure __rows exists
                if (!node.__rows) node.__rows = {};
                node.__rows[idx] ??= { __children: {}, __comp: comp };
                ptr = node.__rows[idx].__children;
              } else if (i === parts.length - 1) {
                // Special handling for panel and well components to ensure they can have children
                const isWellComponent = comp?.component?.type === 'well' || comp?.type === 'well';

                // Now check if it's either a panel or well component
                if (isPanelComponent || isWellComponent) {


                  // If this is a panel, well, or datamap, make sure it has the __children property
                  ptr[key] = {
                    __leaf: false, // Not a leaf since it's a container
                    __label: label || key,
                    __value: value,
                    __comp: comp,
                    __formIndex: formIndex,
                    __children: {}, // Container for child components
                    __rows: {},
                    __suppress: false,
                    __kind: null,
                    __colKeys: null,
                    __colLabels: null
                  };
                } else {
                  // Normal leaf component
                  ptr[key] = {
                    __leaf: true,
                    __label: label || key,
                    __value: value,
                    __comp: comp,
                    __formIndex: formIndex
                  };
                }
              } else {
                // Ensure __children exists
                if (!node.__children) node.__children = {};
                // Patch: ensure every child node has __comp
                Object.keys(node.__children).forEach(childKey => {
                  if (node.__children[childKey] && !node.__children[childKey].__comp) {
                    node.__children[childKey].__comp = comp;
                  }
                });
                ptr = node.__children;
              }
              if (comp?.component?.type === 'dataMap' || comp?.type === 'dataMap') {
                // Always set __comp for the DataMap container node
                ptr[key].__comp = comp;
                // Also set __comp for all children of the DataMap node
                if (ptr[key].__children && typeof ptr[key].__children === 'object') {
                  Object.keys(ptr[key].__children).forEach(childKey => {
                    if (ptr[key].__children[childKey] && !ptr[key].__children[childKey].__comp) {
                      ptr[key].__children[childKey].__comp = comp;
                    }
                  });
                }
              }
            } catch (error) {
              console.error('Error processing path segment:', {
                segment: seg,
                key,
                path: normalizedPath,
                error: error.message
              });
              // Skip to the next part if there's an error
              continue;
            }
          }
        }

        // ---- render tree
        const renderNode = (node, depth = 0) => {
          const pad = `margin-left:${depth * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;

          // Sort entries based on formIndex
          const sortedEntries = Object.entries(node).sort((a, b) => {
            const aIsTagpad = a[1]?.__label === 'Tagpad' || a[1]?.__comp?.component?.type === 'tagpad';
            const bIsTagpad = b[1]?.__label === 'Tagpad' || b[1]?.__comp?.component?.type === 'tagpad';

            // If both are tagpads, sort by formIndex
            if (aIsTagpad && bIsTagpad) {
              return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
            }

            // If one is a tagpad, prioritize based on formIndex
            if (aIsTagpad) return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? 0);
            if (bIsTagpad) return (a[1]?.__formIndex ?? 0) - (b[1]?.__formIndex ?? -1);

            // Default sorting by formIndex
            return (a[1]?.__formIndex ?? -1) - (b[1]?.__formIndex ?? -1);
          });

          console.log("sorted entries", sortedEntries)
          return sortedEntries.map(([k, v]) => {
            
            // For DataMap containers, flatten all __children from __rows into v.__children
            if (v.__comp?._visible == false || v.__comp?.type === 'datasource' ||
               (v.__comp?.component.reviewVisible == false && !v.__comp?.component.validate.required)) {
              return '';
            }

            if (v.__comp?.parent?.type === 'datamap') {
              // Merge all __children from each row into v.__children
              if (v?.__rows) {
                v.__children = {};
                Object.values(v.__rows).forEach(row => {
                  if (row?.__children) {
                    Object.entries(row.__children).forEach(([childKey, childVal]) => {
                      v.__children[childVal.__label] = childVal;
                    });
                  }
                });
                v.__rows = {}; // Clear rows after flattening
              }
            }

            // ignore stray tokens
            if (/^\d+\]$/.test(k) || v?.__comp == undefined) {
              return v && typeof v === 'object' ? renderNode(v.__children || {}, depth) : '';
            }

            if (v && v.__leaf) {
              // Check if this is a form component leaf
              const isFormComponent = v.__comp?.type === 'form' || v.__comp?.component?.type === 'form';

              const val = firstLeafVal(v);

              // Check if this is a tagpad form entry from path - simplified check to avoid potential recursion
              const isTagpadDot = v.__label?.startsWith('Tag ') ||
                (v.__comp?.type === 'tagpad') ||
                (v.__comp?.parent?.type === 'tagpad');

              // Special handling for form components
              if (isFormComponent) {
                // For form components, render as a section header
                const formValue = v.__value || {};
                let formContentHtml = '';

                // Attempt to extract and render the form fields
                if (typeof formValue === 'object' && !Array.isArray(formValue)) {
                  formContentHtml = Object.entries(formValue)
                    .filter(([fieldKey, fieldVal]) => fieldVal !== null && fieldVal !== undefined)
                    .map(([fieldKey, fieldVal]) => {
                      const displayVal = typeof fieldVal === 'object'
                        ? JSON.stringify(fieldVal)
                        : String(fieldVal);
                      return `<div style="${pad}; margin-left:${(depth + 1) * 15}px;"><strong>${fieldKey}:</strong> ${displayVal}</div>`;
                    })
                    .join('');
                }

                return `
                  <div style="${pad}"><strong>${v.__label || k}:</strong></div>
                  ${formContentHtml || `<div style="${pad}; margin-left:${(depth + 1) * 15}px;">(No data)</div>`}
                `;
              } else if (isTagpadDot) {
                // For tagpad forms, simplify to just show label: value (without nested divs)
                // If the value is empty object or undefined, still show the label with empty indicator

                // Otherwise, show the value
                return `<div style="${pad}"><strong>${v.__label || k}:</strong> ${val}</div>`;
              } else {
                // Normal rendering for other leaf nodes
                return `<div style="${pad}"><strong>${v.__label || k}:</strong> ${val}</div>`;
              }
            }

            if (v && typeof v === 'object') {
              const hasChildren = v.__children && Object.keys(v.__children).length;
              const hasRows = v.__rows && Object.keys(v.__rows).length;
              const isPanelComponent = v.__comp?.component?.type === 'panel' ||
                v.__comp?.type === 'panel' ||
                v.__comp?.component?.type === 'well' ||
                v.__comp?.type === 'well';


              const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k));
              const header = displayLabel ? `<div style="${pad}"><strong>${displayLabel}:</strong>` : `<div style="${pad}">`;

              // Check explicitly for well components
              const isWellComponent = v.__comp?.component?.type === 'well' || v.__comp?.type === 'well';

              // Check if this node has a custom component structure
              const hasCustomStructure = v.__value &&
                (v.__value._type === 'panel' ||
                  v.__value._type === 'well' ||
                  v.__value._type === 'container' ||
                  v.__value._type === 'fieldset' ||
                  v.__value._type === 'columns' ||
                  (v.__value._row && Array.isArray(v.__value._row)));

              // Special handling for panel and well components
              if (isPanelComponent || isWellComponent || hasCustomStructure) {
                // Get all direct child components to display under this panel
                let panelChildrenHtml = '';

                // If this panel has children in the tree
                if (hasChildren) {
                  // Get all child components to render
                  panelChildrenHtml = renderNode(v.__children, depth + 1);
                }
                // If no children were found in the tree but we have child components in the original component
                else if (v.__comp && Array.isArray(v.__comp.components) && v.__comp.components.length > 0) {

                }

                // Check for custom structure
                const customStructure = v.__value && v.__value._type && v.__value._row;
                if (customStructure) {
                  // Render custom structure
                  const containerType = v.__value._type;
                  const containerLabel = v.__value._label || displayLabel || containerType;
                  let customChildrenHtml = '';

                  // Process the rows from the custom structure
                  if (Array.isArray(v.__value._row)) {
                    customChildrenHtml = v.__value._row.map(item => {
                      if (item._children) {
                        // Direct child item
                        const childLabel = item._children._label || '';
                        const childValue = item._children._value || '';
                        return `<div style="${pad}margin-left:${(depth + 1) * 15}px;"><strong>${childLabel}:</strong> ${childValue}</div>`;
                      } else if (item._row && Array.isArray(item._row)) {
                        // Row of items
                        return item._row.map(cell => {
                          if (cell._children) {
                            const cellLabel = cell._children._label || '';
                            const cellValue = cell._children._value || '';
                            return `<div style="${pad}margin-left:${(depth + 1) * 15}px;"><strong>${cellLabel}:</strong> ${cellValue}</div>`;
                          }
                          return '';
                        }).join('');
                      }
                      return '';
                    }).join('');
                  }

                  return `
                    <div style="margin-left:0px; padding-left:10px; border-left:1px dotted #ccc;">
                      <strong>${containerLabel}</strong>
                      <div style="padding-left: 10px;">
                        ${customChildrenHtml || panelChildrenHtml}
                      </div>
                    </div>
                  `;
                } else {
                  // Determine the appropriate container title
                  const isWell = v.__comp?.component?.type === 'well' || v.__comp?.type === 'well';
                  const containerType = isWell ? 'Well' : 'Panel';

                  // Create a fieldset-like container for better grouping
                  return `
                    <div style="margin-left:0px; padding-left:10px; border-left:1px dotted #ccc;">
                      <strong>${displayLabel || containerType}</strong>
                      <div style="padding-left: 10px;">
                        ${panelChildrenHtml}
                      </div>
                    </div>
                  `;
                }
              }

              // ---- DataGrid/DataTable: render as Rows -> Columns -> fields
              if ((v.__kind === 'datagrid' || v.__kind === 'datatable') && hasRows) {
                // which columns are present across rows?
                const presentKeys = new Set();
                Object.values(v.__rows).forEach(r => {
                  Object.keys(r.__children || {}).forEach(cKey => presentKeys.add(cKey));
                });

                // Debug check for duplicate rendering


                // keep schema order if we have it
                const orderedKeys = Array.isArray(v.__colKeys) && v.__colKeys.length
                  ? v.__colKeys.filter(cKey => presentKeys.has(cKey))
                  : Array.from(presentKeys);



                const labelByKey = new Map(
                  (v.__colKeys || []).map((cKey, i) => [cKey, (v.__colLabels || [])[i] || cKey])
                ); const rowIdxs = Object.keys(v.__rows).map(n => Number(n)).sort((a, b) => a - b);
                const rowsHtml = rowIdxs.map((rowIdx) => {
                  const row = v.__rows[rowIdx];
                  const haveMultiCols = orderedKeys.length > 1;

                  // indent for "Column" lines
                  const padRow = `margin-left:${(depth + 1) * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;
                  const padCol = `margin-left:${(depth + 2) * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;

                  if (haveMultiCols) {
                    // Log the row children for debug


                    // Ensure we're not duplicating fields
                    const processedInThisRow = new Set();

                    const colsHtml = orderedKeys.map((colKey, colIdx) => {
                      // Skip if we've already processed this column for this row
                      if (processedInThisRow.has(colKey)) {
                        return '';
                      }

                      processedInThisRow.add(colKey);
                      const cell = row.__children[colKey];
                      let cellContent = '';

                      if (cell.__leaf) {
                        const val = firstLeafVal(cell);
                        cellContent = `<div style="${padCol}"><strong>${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${val}</div>`;
                      }
                      return `${cellContent}`;
                    }).filter(html => html.length > 0).join('');

                    return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}">Row ${rowIdx + 1}:${colsHtml}</li>`;
                  } else {
                    // single-column grid → just render the cell contents under the row
                    const onlyKey = orderedKeys[0];
                    const cell = row.__children[onlyKey];
                    const inner = cell?.__leaf
                      ? `<div style="${padRow}"><strong>${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong> ${firstLeafVal(cell)}</div>`
                      : renderNode(cell?.__children || {}, depth + 1);
                    return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;', '')}">Row ${rowIdx + 1}:${inner}</li>`;
                  }
                }).join('');

                return `${header}<ul style="list-style-type:circle; padding-left:30px; margin:0;">${rowsHtml}</ul></div>`;
              }

              // ---- default rendering
              const childrenHtml = [
                hasRows
                  ? `<ul style="list-style-type:circle; padding-left:30px; margin:0;">${Object.entries(v.__rows).map(([i, r]) => {
                    // For tagpad components, show "Tag X" instead of "Row X"
                    const isTagpad = k === 'tagpad' ||
                      v.__label === 'Tagpad' ||
                      v.__comp?.component?.type === 'tagpad' ||
                      v.__comp?.type === 'tagpad';
                    const rowLabel = isTagpad ? `Tag ${Number(i) + 1}` : `Row ${Number(i) + 1}`;

                    // Handle empty tag pad case
                    const hasChildren = r.__children && Object.keys(r.__children).length > 0;
                    const content = hasChildren
                      ? renderNode(r.__children, depth + 1)
                      : ``;

                    // Apply special class for tagpad rows to help with styling/debugging
                    const rowClass = isTagpad ? 'tagpad-row' : 'data-row';

                    return `<li class="${rowClass}" style="margin-left:0 !important; padding-left: 0 !important;">${rowLabel}:${content}</li>`;
                  }).join('')
                  }</ul>` : '',
                hasChildren ? renderNode(v.__children, depth + 1) : ''
              ].join('');
              return `${header}${childrenHtml}</div>`;
            }
            return '';
          }).join('');
        };

        // tiny spacer to keep "Column X" label on its own line before fields
        function innerSpacer() { return `<span style="display:block;height:2px;"></span>`; }

        // Log the structured tree for debugging


        return renderNode(root, 0);
      }


      const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } =
        await collectReviewLeavesAndLabels(this.root);

      // Pass this.root as a parameter to renderLeaves
      const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, this.root);

      // Get the latest data after refresh
      const allData = this.root.getValue();
      const supportNumber = allData?.data?.billingCustomer || "Unavailable";

      const modal = document.createElement("div");
      modal.style.zIndex = "1000";
      modal.className =
        "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";

      modal.innerHTML = `
        <div class="bg-white p-6 rounded shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h2 class="text-xl font-semibold mb-4">Review Form Data</h2>
          <div class="mb-4 text-sm" style="max-height:200px; overflow-y:auto; border:1px solid #ccc; padding:8px;">
            ${reviewHtml}
          </div>
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
          </div>
          <div class="mb-4 text-sm w-full" id="screenshotWrapper" style="display: none;">
            <label for="screenshotContainer">Screenshot Upload<span class="text-red-500">(Required)*</label>
            <div id="screenshotContainer"></div>
          </div>
          <div class="mb-4 text-sm w-full" id="notesOptionalWrapper" style="display: none;">
            <label class="block font-medium mb-1">Notes (optional)</label>
            <textarea id="notesOptional" class="w-full border rounded p-2 text-sm"></textarea>
          </div>
          <div class="mb-4 text-sm w-full" id="notesRequiredWrapper" style="display: none;">
            <label class="block font-medium mb-1">Explain why not verified<span class="text-red-500">(Required)*</span></label>
            <textarea id="notesRequired" class="w-full border rounded p-2 text-sm"></textarea>
          </div>
          <div class="mt-4 flex justify-end space-x-4">
            <button class="px-4 py-2 btn btn-primary rounded" id="cancelModal">Cancel</button>
            <button class="px-4 py-2 btn btn-primary rounded" id="submitModal">Submit</button>
          </div>
        </div>`;

      document.body.appendChild(modal);

      // ----- FILE COMPONENT WIRING -----
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

      verifiedSelect.onchange = () => {
        const value = verifiedSelect.value;
        const needShot = value === "App" || value === "Support";
        screenshotWrapper.style.display = needShot ? "block" : "none";
        notesOptionalWrapper.style.display = needShot ? "block" : "none";
        notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
      };

      modal.querySelector("#cancelModal").onclick = async () => {
        hideScreenshot();

        // Rerun validation after modal close
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

      modal.querySelector("#submitModal").onclick = async () => {
        let hasErrors = false;

        // Get verification type first - we'll need it for all validation checks
        const verifiedElement = modal.querySelector("#verified");
        const selectedVerificationType = verifiedElement ? verifiedElement.value : "Empty";

        // 1. Always validate the verification selection
        if (verifiedElement && selectedVerificationType === "Empty") {
          verifiedElement.style.border = "2px solid red";
          verifiedElement.classList.add("invalid-field");
          hasErrors = true;

        } else if (verifiedElement) {
          verifiedElement.style.border = "";
          verifiedElement.classList.remove("invalid-field");
        }

        // 2. Validate support number field
        const supportNumberElement = modal.querySelector("#supportNumber");
        if (supportNumberElement && !supportNumberElement.value.trim()) {
          supportNumberElement.style.border = "2px solid red";
          supportNumberElement.classList.add("invalid-field");
          hasErrors = true;
        } else if (supportNumberElement) {
          supportNumberElement.style.border = "";
          supportNumberElement.classList.remove("invalid-field");
        }

        // 3. For "App" or "Support" verification, screenshot is required
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

        // 4. For "Not Verified", notes are required
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
        if (hasErrors) {
          submitButton.style.backgroundColor = "gray";
          submitButton.style.cursor = "not-allowed";
          submitButton.disabled = true;
          alert("Please fill out all required fields correctly.");
          return;
        } else {
          submitButton.style.backgroundColor = "";
          submitButton.style.cursor = "pointer";
          submitButton.disabled = false;
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

      const cached = this.component._reviewModalCache;
      if (cached) {
        modal.querySelector("#verified").value = cached.verifiedSelect || "";
        modal.querySelector("#notesRequired").value = cached.notesRequired || "";
        modal.querySelector("#notesOptional").value = cached.notesOptional || "";
        modal.querySelector("#supportNumber").value = cached.supportNumber || "Unavailable";
        verifiedSelect.dispatchEvent(new Event("change"));
      }
    });

    return super.attach(element);
  }
}

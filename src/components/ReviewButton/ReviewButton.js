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
  restoreCachedValues,
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
        if (!component.visible || component.disabled || component._visible === false || component.component?.hidden) return true;

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
      const results = initializeExternalValidationResults();
      this.markAllComponentsAsDirty();
      const data = this.root?.submission?.data ?? this.root?.data ?? {};

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

        // Collect form data for review
        const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } =
          await collectReviewLeavesAndLabels(this.root);

        // Get invalid fields
        const invalidFields = new Set();
        const validation = await this.validateFormExternal({
          showErrors: false,
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

        // Filter invalid fields
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
          
          filteredInvalidFields.add(field);
        });

        // Render the review content
        const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath, this.root, filteredInvalidFields);

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

        // Setup screenshot component if needed
        const screenshotControls = setupScreenshotComponent(modal, screenshotComp, validateModalForm);

        // Setup modal event handlers
        setupModalEventHandlers(modal, screenshotComp, screenshotControls?.hide, validateModalForm, async (modalData) => {
          // Handle form submission
          await this.handleFormSubmission(modalData);
        });

        // Restore cached values if any
        restoreCachedValues(modal, this.component._reviewModalCache);

        // Add modal to DOM
        document.body.appendChild(modal);

      } catch (e) {
        console.error("Error in review button click handler:", e);
        alert("An error occurred while preparing the form for review. Please try again.");
      }
    });

    return super.attach(element);
  }
}

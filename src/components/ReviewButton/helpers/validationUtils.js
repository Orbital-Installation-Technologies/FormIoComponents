/**
 * Validation and utility functions for ReviewButton component
 * Extracted to improve maintainability and reusability
 */

// Constants
const CONTAINER_TYPES = new Set(['panel', 'columns', 'well', 'fieldset', 'datamap', 'editgrid', 'table', 'tabs', 'row', 'column', 'content', 'htmlelement']);
const FLATTEN_TYPES = new Set(['columns', 'fieldset', 'tabs', 'tagpad', 'survey', 'panel', 'well', 'container', 'datagrid', 'datatable']);

/**
 * Check if a component type is a container type
 */
export const isContainerType = (t, exclude = []) => {
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

/**
 * Check if a container should be flattened
 */
export const shouldFlattenContainer = (t) => {
  if (!t) return false; // Early exit if no type

  if (Array.isArray(t)) {
    return t.some(type => type && FLATTEN_TYPES.has(type.toLowerCase()));
  }

  return FLATTEN_TYPES.has(t.toLowerCase());
};

/**
 * Check if a value contains actual file data
 */
export const hasActualFileData = (value) => {
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.length > 0 && value.some(item => item && (item.name || item.filename || item.originalName || item.url || item.data));
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

/**
 * Get nested value from object using dot notation path
 */
export const getNestedValue = (obj, path) => {
  if (!obj || !path) return null;
  return path.split('.').reduce((acc, p) => (acc && typeof acc === 'object' ? acc[p] : null), obj);
};

/**
 * Check if a component is an address component
 */
export const isAddressComponent = (component) =>
  component.component?.type === 'address' || component.type === 'address';

export const isGpsComponent = (component) =>
  component.component?.type === 'gps' || component.type === 'gps';

/**
 * Check if a component is datagrid-like
 */
export const isDatagridLike = (comp) =>
  comp?.component?.type === 'datagrid' || comp?.component?.type === 'datatable';

/**
 * Initialize validation results object
 */
export const initializeValidationResults = () => ({
  isValid: true,
  fieldResults: {},
  errors: {},
  invalidComponents: []
});

/**
 * Initialize external validation results object
 */
export const initializeExternalValidationResults = () => ({
  isValid: true,
  fieldResults: {},
  errors: {},
  warnings: {},
  invalidComponents: [],
  warningCount: 0,
  errorCount: 0,
  errorSummary: ''
});

/**
 * Create error results object
 */
export const createErrorResults = () => ({
  isValid: false,
  fieldResults: {},
  errors: { system: { label: 'System', errors: ['Field validation failed'] } },
  invalidComponents: []
});

/**
 * Create external error results object
 */
export const createExternalErrorResults = () => ({
  isValid: false,
  fieldResults: {},
  errors: { system: { label: 'System', errors: ['Validation failed'] } },
  warnings: {},
  invalidComponents: [],
  warningCount: 0,
  errorCount: 0,
  errorSummary: 'Validation failed'
});

/**
 * Mark component as dirty
 */
export const markComponentAsDirty = (component) => {
  if (typeof component.setPristine === 'function') component.setPristine(false);
  if (typeof component.setDirty === 'function') component.setDirty(true);
};

/**
 * Record component validation result
 */
export const recordComponentValidationResult = (
  results,
  component,
  key,
  label,
  path,
  isValid,
  showErrors
) => {
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
};

/**
 * Process component errors
 */
export const processComponentErrors = (component, errorMap, results, showErrors) => {
  console.log("processComponentErrors", {
    componentKey: component.key,
    componentPath: component.path,
    componentLabel: component.component?.label,
    errors: component.errors,
    showErrors
  });
  
  results.isValid = false;
  results.errorCount++;

  const componentKey = component.key || component.path;
  const componentLabel = component.component?.label || componentKey;
  const componentPath = component.path || componentKey;

  const errors = component.errors;
  if (!errors || !errors.length) {
    console.log("No errors found for component:", componentKey);
    return;     // this early check will skip almost all work
  }
  
  if (errors && errors.length) {
    console.log("Processing errors for component:", componentKey, "errors:", errors);
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

  console.log("Added invalid component:", {
    path: componentPath,
    label: componentLabel,
    totalInvalidComponents: results.invalidComponents.length
  });

  if (showErrors && errors && errors.length) {
    console.log("Setting custom validity for component:", componentKey, "errors:", errors);
    component.setCustomValidity(errors, true);
  }
};

/**
 * Process component warnings
 */
export const processComponentWarnings = (component, warningMap, results) => {
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
};

/**
 * Validate selected components
 */
export const validateSelectedComponents = async (components, results, options, context) => {
  for (const component of components) {
    const { key, path, type, dataValue, component: componentDefinition} = component;
    const componentKey = key || path;
    const componentLabel = componentDefinition?.label || componentKey;
    const componentPath = path || componentKey;
    const isAddress = isAddressComponent(component);

    markComponentAsDirty(component);

    let isValid = true;

    // Normalize invalid address value
    if (isAddress && dataValue === '[object Object]') {
      component.dataValue = {};
    }

    if (component.checkValidity) {
      if (isAddress && componentDefinition?.validate?.required) {
         const addressValue = dataValue?.formattedPlace;
         const isAddressEmpty = !addressValue || addressValue.trim() === '';
          

        if (isAddressEmpty)  {
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

    recordComponentValidationResult(
      results,
      component,
      componentKey,
      componentLabel,
      componentPath,
      isValid,
      options.showErrors
    );
  }
};

/**
 * Validate components and collect results
 */
export const validateComponentsAndCollectResults = async (root, errorMap, warningMap, results, opts) => {
  console.log("validateComponentsAndCollectResults called with:", {
    includeWarnings: opts?.includeWarnings,
    showErrors: opts?.showErrors,
    errorMapSize: errorMap.size
  });
  const { includeWarnings, showErrors } = opts || {};

  let componentCount = 0;
  let invalidCount = 0;

  root.everyComponent((component) => {
    if( component._visible === false){
      if (typeof component.setPristine === 'function') component.setPristine(true);
      if (typeof component.setDirty === 'function') component.setDirty(false);
    }
    componentCount++;
    try {
      // Skip validation for hidden components
      if (component.component?.hidden === true || component.hidden === true) return;
      
      // Skip validation for disabled components unless they're marked review visible
      if (component.disabled === true || component.component?.disabled === true) {
        if (component.component?.reviewVisible !== true) return;
      }
      
      if (!component.visible || !component.checkValidity) return;

      // ---------- Address components ----------
      if (isAddressComponent(component)) {
        if (component.dataValue === '[object Object]') component.dataValue = {};
        const isValid = component.checkValidity();
        console.log('Address component validation:', {
          key: component.key,
          path: component.path,
          isValid,
          dataValue: component.dataValue
        });
        if (!isValid) {
          console.log("Address component is invalid:", component.key, component.path);
          processComponentErrors(component, errorMap, results, showErrors);
          invalidCount++;
        }
        if (includeWarnings && component.warnings?.length) {
          //processComponentWarnings(component, warningMap, results);
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

        const rootData = root?.data;
        const submissionData = root?.submission?.data;
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
        const files = component.fileService?.files;
        if (!hasValue && component.fileService && files && Array.isArray(files) && files.length > 0) {
          hasValue = true;
        }

        const isValid = !isRequired || hasValue;
        if (!isValid) {
          processComponentErrors(component, errorMap, results, showErrors);
        }
        if (includeWarnings && component.warnings?.length) {
          processComponentWarnings(component, warningMap, results);
        }
        return;
      }

      // ---------- GPS components ----------
      if (isGpsComponent(component)) {
        const isValid = component.isValid();
        const errorsNow = component.validate(true, component.getValue());

        if (!isValid) {
          component.setCustomValidity(errorsNow, true);
          invalidCount++;
        }
        if (includeWarnings && component.warnings?.length) {
          processComponentWarnings(component, warningMap, results);
        }
        return;
      }
      // ---------- Other components ----------
      const isValid = component.checkValidity();
      console.log('Component validation:', {
        key: component.key,
        path: component.path,
        type: component.type || component.component?.type,
        isValid,
        required: component.component?.validate?.required
      });
      if (!isValid) {
        console.log("Component is invalid:", component.key, component.path);
        processComponentErrors(component, errorMap, results, showErrors);
        invalidCount++;
      }
      if (includeWarnings && component.warnings?.length) {
        processComponentWarnings(component, warningMap, results);
      }
    } catch (err) {
      console.error(`Error validating component ${component.key}:`, err);
    }
  });
  
  console.log('Validation summary:', {
    totalComponents: componentCount,
    invalidComponents: invalidCount,
    errorMapSize: errorMap.size
  });
};

/**
 * Check if form is valid
 */
export const isFormValid = async (root) => {
  try {
    if (!root || !root.everyComponent) return true;
    const rootData = root?.data;
    const submissionData = root?.submission?.data;
    let isValid = true;

    root.everyComponent((c) => {
      try {
        // Skip validation for hidden components
        if (c.component?.hidden === true || c.hidden === true) return;
        
        // Skip validation for disabled components unless they're marked review visible
        if (c.disabled === true || c.component?.disabled === true) {
          if (c.component?.reviewVisible !== true) return;
        }
        
        if (!c.checkValidity || c.visible === false) return;

        const comp = c.component;
        const type = c.type || comp?.type;
        const componentKey = c.key || comp.key;

        // Address component check
        const isAddress = type === 'address';
        if (isAddress && c.dataValue === '[object Object]') {
          c.dataValue = {};
        }

        if (isAddress && comp.validate?.required) {
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
};

/**
 * Safely update component
 */
export const safelyUpdateComponent = (component, context) => {
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
  if (componentUpdateValue && typeof componentUpdateValue === 'function') {
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
};

/**
 * Update datagrid values
 */
export const updateDatagridValues = (datagrid) => {
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
            safelyUpdateComponent(component, 'datatable row component');
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
            safelyUpdateComponent(component, 'datagrid row component');
          });
        }
      });
  }
};

/**
 * Update form values
 */
export const updateFormValues = async (root) => {
  try {
    await Promise.resolve(); // if you don't need exactly to wait for 100ms, this can do the work

    const allDatagrids = [];

    if (root && typeof root.everyComponent === 'function') {
      try {
        root.everyComponent((comp) => {
          if (isDatagridLike(comp)) allDatagrids.push(comp);
        });
      } catch (e) {
        console.error("Error collecting datagrids/datatables:", e);
      }
    }

    if (allDatagrids.length) {
      for (const datagrid of allDatagrids) {
        try {
          updateDatagridValues(datagrid);
        } catch (e) {
          console.error("Error updating datagrid/datatable values:", e);
        }
      }
    }

    try {
      updateTopLevelComponentValues(root);
    } catch (e) {
      console.error("Error updating top-level components:", e);
    }
  } catch (e) {
    console.error("Error in updateFormValues:", e);
  }
};

/**
 * Update top level component values
 */
export const updateTopLevelComponentValues = (root) => {
  if (Array.isArray(root.components)) {
    root.components.forEach(comp => {
      safelyUpdateComponent(comp, 'top-level component');
    });
  }
};

/**
 * Generate error summary from error map
 */
export const generateErrorSummary = (errorMap, results) => {
  const errorCount = errorMap.size;
  if (errorCount === 0) {
    results.errorSummary = 'No validation errors found.';
    return;
  }

  const errorList = Array.from(errorMap.entries()).map(([path, error]) => 
    `• ${error.label}: ${error.errors.join(', ')}`
  );

  results.errorSummary = `Found ${errorCount} validation error${errorCount > 1 ? 's' : ''}:\n${errorList.join('\n')}`;
};

/**
 * Find components to validate by keys
 */
export const findComponentsToValidate = (keys, root) => {
  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  const componentsToValidate = [];
  const keySet = new Set(keys);

  root.everyComponent((component) => {
    const componentKey = component.key || component.path;
    if (keySet.has(componentKey)) {
      componentsToValidate.push(component);
    }
  });

  return componentsToValidate;
};

/**
 * Clears all error states and visual indicators from a field component
 * @param {Object} comp - Form.io component to clear errors from
 */
export function clearFieldErrors(comp) {
  if (!comp) return;

  // Clear component error state
  comp.error = '';
  // Use setCustomValidity to safely clear errors
  if (comp.setCustomValidity) {
    comp.setCustomValidity([], false);
  }
  comp.setPristine(true);

  if (!comp.element) return;

  // Remove error classes from component element
  comp.element.classList.remove('has-error', 'has-message', 'formio-error-wrapper');

  // Remove error class from form-group
  var formGroup = comp.element.closest('.form-group') || comp.element.querySelector('.form-group') || comp.element;
  if (formGroup) {
    formGroup.classList.remove('has-error');
  }

  // Remove error styling from input element
  var input = comp.element.querySelector('input, select, textarea, .choices__inner');
  if (input) {
    input.classList.remove('is-invalid', 'form-control-danger');
    input.style.removeProperty('border-color');
    input.style.removeProperty('border-width');
  }

  // Remove all error message elements
  var errMsgs = comp.element.querySelectorAll('.formio-errors, .invalid-feedback, .error');
  errMsgs.forEach(function(msg) {
    if (msg && msg.parentNode) {
      msg.parentNode.removeChild(msg);
    }
  });

  // Also check in parent elements for error messages
  if (formGroup) {
    var parentErrMsgs = formGroup.querySelectorAll('.formio-errors, .invalid-feedback');
    parentErrMsgs.forEach(function(msg) {
      if (msg && msg.parentNode) {
        msg.parentNode.removeChild(msg);
      }
    });
  }

  // Trigger a redraw to update the component display
  if (comp.redraw) {
    setTimeout(function() {
      comp.redraw();
    }, 50);
  }
}

/**
 * Checks if a field is now valid (used for real-time error clearing)
 * @param {Object} comp - Form.io component to check
 * @param {*} value - Current value of the field
 * @returns {boolean} - True if field is valid
 */
export function isFieldNowValid(comp, value) {
  if (!comp) return false;

  var compType = comp.type || comp.component.type;

  // SPECIAL CASE: File fields
  if (compType === 'file') {
    var hasFile = hasActualFileData(value) ||
      hasActualFileData(comp.dataValue) ||
      (comp.files && comp.files.length > 0);

    // Check DOM file inputs as fallback
    if (!hasFile && comp.element) {
      var fileInputs = comp.element.querySelectorAll('input[type="file"]');
      for (var i = 0; i < fileInputs.length; i++) {
        if (fileInputs[i]?.files && fileInputs[i].files.length > 0) {
          hasFile = true;
          break;
        }
      }
    }

    return hasFile;
  }

  // NON-FILE FIELDS
  else {
    // Check if field is required
    var isRequired = comp.component?.validate?.required || comp.validate?.required;

    if (!isRequired) {
      return true; // Non-required fields are always valid
    }

    // Get the current value from multiple sources
    var currentValue = value;
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      currentValue = comp.dataValue;
    }
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      if (comp.getValue) {
        currentValue = comp.getValue();
      }
    }
    if (currentValue === null || currentValue === undefined || currentValue === '') {
      var dataKey = comp.component?.key;
      if (dataKey && comp.data) {
        currentValue = comp.data[dataKey];
      }
    }

    // SPECIAL CASE: Radio buttons - check DOM state
    if (compType === 'radio' && comp.element) {
      var checkedRadio = comp.element.querySelector('input[type="radio"]:checked');
      if (checkedRadio && checkedRadio.value) {
        currentValue = checkedRadio.value;
      }
    }

    // SPECIAL CASE: Selectboxes (checkboxes) - check for any selected values
    if (compType === 'selectboxes') {
      if (typeof currentValue === 'object' && currentValue !== null) {
        // Check if any checkbox is checked
        var hasChecked = Object.keys(currentValue).some(function(key) {
          return currentValue[key] === true;
        });
        if (hasChecked) {
          return true; // At least one checkbox is selected
        }
      }
    }

    // Check if field has a value
    var hasValue = false;
    if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
      if (Array.isArray(currentValue)) {
        hasValue = currentValue.length > 0;
      } else if (typeof currentValue === 'object') {
        hasValue = Object.keys(currentValue).length > 0;
      } else if (typeof currentValue === 'string') {
        hasValue = currentValue.trim().length > 0;
      } else if (typeof currentValue === 'number') {
        hasValue = true; // Numbers are always valid even if 0
      } else if (typeof currentValue === 'boolean') {
        hasValue = true; // Booleans are always valid
      } else {
        hasValue = true;
      }
    }

    if (!hasValue) {
      return false;
    }

    // If it has a value, run full validation to check other rules (e.g., format, length)
    if (comp.checkValidity) {
      // Save current state
      var oldErrors = comp.errors ? [].concat(comp.errors) : [];
      // Use setCustomValidity to safely clear errors
      if (comp.setCustomValidity) {
        comp.setCustomValidity([], false);
      }

      var validationResult = comp.checkValidity(comp.data, false, comp.data);
      var isValid = validationResult === true || (comp.errors && comp.errors.length === 0);

      // Restore errors if validation failed
      if (!isValid && comp.setCustomValidity) {
        comp.setCustomValidity(oldErrors, true);
      }

      return isValid;
    }

    return hasValue;
  }
}

/**
 * Enhanced file validation method with relaxed required validation
 * @param {Object} comp - File component to validate
 * @returns {boolean} - True if valid
 */
export function validateFileComponentWithRelaxedRequired(comp) {
  if (!comp) return false;
  
  const isFile = (comp.type || comp.component?.type) === 'file';
  if (!isFile) return false;
  
  const isRequired = !!(comp.component?.validate?.required || comp.validate?.required);
  if (!isRequired) return true; // Not required, so always valid
  
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
  
  let hasVal = candidates.some(v => hasActualFileData(v));
  
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
  
  if (hasVal) {
    // Clear errors immediately and force component update
    clearFieldErrors(comp);
    return true;
  }
  
  return false; // No files found, so invalid if required
}

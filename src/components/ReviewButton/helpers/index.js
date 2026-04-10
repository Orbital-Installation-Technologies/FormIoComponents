/**
 * Index file for ReviewButton helpers
 * Provides a centralized export point for all helper functions
 */

// Validation utilities
export {
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
  clearFieldErrors,
  isFieldNowValid,
  validateFileComponentWithRelaxedRequired,
  clearValidationCaches
} from './validationUtils.js';

// Review modal helpers
export {
  createReviewModal,
  validateModalForm,
  setupScreenshotComponent,
  setupModalEventHandlers,
  updateFormWithModalData,
  collectFormDataForReview,
  updateFormValuesBeforeReview,
  scrollToEndOfPage
} from './reviewHelpers.js';

// Data processing helpers
export {
  findComponentByKey,
  createCustomComponentForReview,
  collectReviewLeavesAndLabels,
  clearDataProcessingCache
} from './dataProcessingHelpers.js';

// UI rendering helpers
export {
  formatValue,
  firstLeafVal,
  getInvalidStyle,
  isFieldInvalid,
  addErrorHighlight,
  removeErrorHighlight,
  ensureErrorHighlightStyles,
  applyFieldErrors
} from './uiRenderingHelpers.js';

// Main rendering helpers
export {
  renderLeaves,
  clearRenderCaches
} from './renderHelpers.js';

// DataGrid validation helpers
export {
  setupChangeListeners,
  setupPanelHooks,
  highlightDataGridRows
} from './dataGridValidationHelpers.js';

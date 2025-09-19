/**
 * Helper functions for ReviewButton component
 * Contains reusable logic for modal creation, validation, data processing, and UI rendering
 */

/**
 * Creates and configures the review modal DOM element
 */
export function createReviewModal(hasErrors, fieldErrorCount, reviewHtml, supportNumber) {
  const modal = document.createElement("div");
  modal.style.zIndex = "1000";
  modal.className = "fixed top-0 left-0 w-full h-screen inset-0 bg-black bg-opacity-50 flex items-center justify-center";

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

  return modal;
}

/**
 * Validates the modal form fields
 */
export function validateModalForm(modal, screenshotComp, formData = null) {
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

  // Only validate screenshot if it's visible and required
  const screenshotWrapper = modal.querySelector("#screenshotWrapper");
  const isScreenshotVisible = screenshotWrapper && screenshotWrapper.style.display !== "none";
  
  if ((selectedVerificationType === "App" || selectedVerificationType === "Support") && isScreenshotVisible) {
    const uploadedFiles = screenshotComp ? (screenshotComp.getValue() || []) : [];
    console.log('Screenshot validation - uploadedFiles:', uploadedFiles);
    console.log('Screenshot validation - screenshotComp:', !!screenshotComp);
    console.log('Screenshot validation - getValue result:', screenshotComp ? screenshotComp.getValue() : 'no component');

    if (uploadedFiles.length === 0) {
      const screenshotContainer = modal.querySelector("#screenshotContainer");
      if (screenshotContainer) {
        screenshotContainer.style.border = "2px solid red";
        hasErrors = true;
      }
    } else if (modal.querySelector("#screenshotContainer")) {
      modal.querySelector("#screenshotContainer").style.border = "";
    }
  } else {
    // Clear screenshot validation when not required
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

  // Check if form has meaningful data
  let hasFormData = true;
  if (formData) {
    hasFormData = checkFormHasData(formData);
  }

  const submitButton = modal.querySelector("#submitModal");
  if (submitButton && submitButton.style != null) {
    if (hasErrors || !hasFormData) {
      submitButton.style.backgroundColor = "gray";
      submitButton.style.cursor = "not-allowed";
      submitButton.disabled = true;
    } else {
      submitButton.style.backgroundColor = "";
      submitButton.style.cursor = "pointer";
      submitButton.disabled = false;
    }
  }

  return hasErrors;
}

/**
 * Checks if the form has meaningful data
 */
function checkFormHasData(formData) {
  if (!formData || typeof formData !== 'object') {
    return false;
  }

  // Check if there's actual data in the form
  const hasData = Object.values(formData).some(value => {
    if (value === null || value === undefined || value === '') {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0 && value.some(item => 
        item !== null && item !== undefined && item !== ''
      );
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0 && Object.values(value).some(v => 
        v !== null && v !== undefined && v !== ''
      );
    }
    return true;
  });

  return hasData;
}

/**
 * Sets up screenshot component in the modal
 */
export function setupScreenshotComponent(modal, screenshotComp, validateModalForm, formData = null) {
  if (!screenshotComp) return null;

  const html = screenshotComp.render();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const compEl = tmp.firstElementChild;
  modal.querySelector("#screenshotContainer").appendChild(compEl);
  screenshotComp.attach(compEl);

  // Ensure the screenshot component is initially visible
  screenshotComp.component.hidden = false;
  if (typeof screenshotComp.setVisible === "function") {
    screenshotComp.setVisible(true);
  } else {
    screenshotComp.visible = true;
  }

  if (screenshotComp && typeof screenshotComp.on === 'function') {
    screenshotComp.on('change', () => validateModalForm(modal, screenshotComp, formData));
  }

  return {
    hide: () => {
      screenshotComp.component.hidden = true;
      if (typeof screenshotComp.setVisible === "function") {
        screenshotComp.setVisible(false);
      } else {
        screenshotComp.visible = false;
      }
    },
    show: () => {
      screenshotComp.component.hidden = false;
      if (typeof screenshotComp.setVisible === "function") {
        screenshotComp.setVisible(true);
      } else {
        screenshotComp.visible = true;
      }
    }
  };
}

/**
 * Sets up modal event handlers
 */
export function setupModalEventHandlers(modal, screenshotComp, hideScreenshot, validateModalForm, onSubmit, formData = null) {
  const verifiedSelect = modal.querySelector("#verified");
  const screenshotWrapper = modal.querySelector("#screenshotWrapper");
  const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
  const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");

  // Verification type change handler
  if (verifiedSelect) {
    verifiedSelect.onchange = () => {
      const value = verifiedSelect.value;
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
      console.log('needShot:', needShot, 'hideScreenshot:', !!hideScreenshot, 'show function:', hideScreenshot && typeof hideScreenshot.show === 'function');
      if (needShot && hideScreenshot && typeof hideScreenshot.show === 'function') {
        hideScreenshot.show();
        console.log('Screenshot component shown');
      } else if (!needShot && hideScreenshot && typeof hideScreenshot.hide === 'function') {
        hideScreenshot.hide();
        console.log('Screenshot component hidden');
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
      
      // Trigger validation to update submit button state
      validateModalForm(modal, screenshotComp, formData);
    };
  }

  // Cancel button handler
  modal.querySelector("#cancelModal").onclick = async () => {
    hideScreenshot();
    document.body.removeChild(modal);
  };

  // Submit button handler
  const submitButton = modal.querySelector("#submitModal");
  if (submitButton) {
    submitButton.onclick = async () => {
      const hasErrors = validateModalForm(modal, screenshotComp, formData);
      if (hasErrors) return;

      const verifiedElement = modal.querySelector("#verified");
      const selectedVerificationType = verifiedElement ? verifiedElement.value : "Empty";
      const notesRequired = modal.querySelector("#notesRequired")?.value || "";
      const notesOptional = modal.querySelector("#notesOptional")?.value || "";
      const supportNumber = modal.querySelector("#supportNumber")?.value || "Unavailable";

      let uploadedFiles = [];
      if (screenshotComp) {
        uploadedFiles = screenshotComp.getValue() || [];
      }
      console.log('Submit button - uploadedFiles:', uploadedFiles);
      console.log('Submit button - screenshotComp:', !!screenshotComp);

      // Final validation checks
      if (selectedVerificationType === "Not Verified" && !notesRequired.trim()) {
        alert("Please explain why not verified.");
        return;
      }
      if ((selectedVerificationType === "App" || selectedVerificationType === "Support") && uploadedFiles.length === 0) {
        alert("Screenshot is required for App or Support verification.");
        return;
      }

      await onSubmit({
        selectedVerificationType,
        notesRequired,
        notesOptional,
        supportNumber,
        uploadedFiles
      });

      hideScreenshot();
      document.body.removeChild(modal);
    };
  }

  // Add input listeners for real-time validation
  const addInputListeners = (element) => {
    if (!element) return;

    const inputs = element.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => validateModalForm(modal, screenshotComp, formData));
      input.addEventListener('change', () => validateModalForm(modal, screenshotComp, formData));
    });
  };

  addInputListeners(modal);
}

/**
 * Restores cached modal values
 */
export function restoreCachedValues(modal, cached) {
  if (!cached) return;

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

/**
 * Updates form values with modal data
 */
export function updateFormWithModalData(root, modalData) {
  root.getComponent("reviewed")?.setValue("true");
  root.getComponent("supportNumber")?.setValue(modalData.supportNumber);
  root.getComponent("verifiedSelect")?.setValue(modalData.selectedVerificationType);
  root.getComponent("notesOptional")?.setValue(modalData.notesOptional);
  root.getComponent("notesRequired")?.setValue(modalData.notesRequired);
}

/**
 * Collects and processes form data for review display
 */
export function collectFormDataForReview(root) {
  const allData = root.getValue();
  const supportNumber = allData?.data?.billingCustomer || "Unavailable";
  
  return {
    allData,
    supportNumber
  };
}

/**
 * Updates datagrid and form values before review
 */
export function updateFormValuesBeforeReview(root) {
  const allDatagrids = [];
  root.everyComponent(comp => {
    const componentType = comp.component?.type || comp.type;
    
    if (componentType === 'well' || componentType === 'table') {
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

  const rootComponents = root.components;
  rootComponents.forEach(comp => {
    if (comp.updateValue && typeof comp.updateValue === 'function') {
      try {
        comp.updateValue();
      } catch (e) { }
    }
  });
}

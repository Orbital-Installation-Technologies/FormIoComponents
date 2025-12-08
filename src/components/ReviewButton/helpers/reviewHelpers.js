
/**
 * Creates and configures the review modal DOM element
 */

export function createReviewModal(hasErrors, fieldErrorCount, reviewHtml, supportNumber, showSupportFields = true) {
  if (typeof document !== "undefined" && !document.getElementById("customDropdownStyle")) {
    const styleTag = document.createElement("style");
    styleTag.id = "customDropdownStyle";
    styleTag.textContent = dropdownCSS;
    document.head.appendChild(styleTag);
  }
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
      
 ${!hasErrors && showSupportFields ? `
      <div class="flex space-x-4 mb-4">
        <div class="text-sm w-1/2">
          <label class="block font-medium mb-1">Support Number</label>
          <input type="text" id="supportNumber" class="w-full border rounded p-2 text-sm bg-gray-100" value="${supportNumber}" disabled />
        </div>
        <div class="custom-dropdown">
          <label class="dropdown-label">Verified</label>
          <div id="verified" class="dropdown-selected w-full border rounded p-2 text-sm" tabindex="0" data-value="Empty">
            <span class="selected-text">Select verification type</span>
            <i class="dropdown icon"></i> 
          </div>
          <ul class="dropdown-list">
            <li data-value="Empty">Select verification type</li>
            <li data-value="App">App</li>
            <li data-value="Support">Support</li>
            <li data-value="Not Verified">Not Verified</li>
          </ul>
        </div>
        <div id="selected-value"></div>
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
    `;

  return modal;
}

/**
 * Validates the modal form fields
 */
export function validateModalForm(modal, screenshotComp, formData = null, requireSupportFields = true) {
  let hasErrors = false;

  if (requireSupportFields) {
    const verifiedElement = modal.querySelector("#verified");
    const selectedVerificationType = verifiedElement ? verifiedElement.getAttribute('data-value') : "Empty";

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
  }

  if (requireSupportFields) {
    const verifiedElement = modal.querySelector("#verified");
    const selectedVerificationType = verifiedElement ? verifiedElement.getAttribute('data-value') : "Empty";
    const screenshotWrapper = modal.querySelector("#screenshotWrapper");
    const isScreenshotVisible = screenshotWrapper && screenshotWrapper.style.display !== "none";

    if ((selectedVerificationType === "App" || selectedVerificationType === "Support") && isScreenshotVisible) {
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
    } else {
      const screenshotContainer = modal.querySelector("#screenshotContainer");
      if (screenshotContainer) {
        screenshotContainer.style.border = "";
        screenshotContainer.classList.remove("invalid-field");
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
  }

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
export function setupScreenshotComponent(modal, screenshotComp, validateModalForm, formData = null, requireSupportFields = true) {
  if (!screenshotComp) return null;
  const screenshotContainer = modal.querySelector("#screenshotContainer");
  if (!screenshotContainer) return null;

  const html = screenshotComp.render();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const compEl = tmp.firstElementChild;
  screenshotContainer.appendChild(compEl);
  screenshotComp.attach(compEl);

  screenshotComp.component.hidden = false;
  if (typeof screenshotComp.setVisible === "function") {
    screenshotComp.setVisible(true);
  } else {
    screenshotComp.visible = true;
  }

  if (screenshotComp && typeof screenshotComp.on === 'function') {
    screenshotComp.on('change', () => validateModalForm(modal, screenshotComp, formData, requireSupportFields));
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
export function setupModalEventHandlers(modal, screenshotComp, hideScreenshot, validateModalForm, onSubmit, formData = null, requireSupportFields = true) {

  const verifiedSelect = modal.querySelector("#verified");
  const screenshotWrapper = modal.querySelector("#screenshotWrapper");
  const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
  const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");

  if (verifiedSelect) {
    verifiedSelect.onchange = () => {
      // const value = verifiedSelect.value;
      const value = verifiedSelect.getAttribute('data-value');
      const needShot = value === "App" || value === "Support";
      
      if (screenshotWrapper) {
        screenshotWrapper.style.display = needShot ? "block" : "none";
      }
      if (notesOptionalWrapper) {
        notesOptionalWrapper.style.display = needShot ? "block" : "none";
      }
      if (notesRequiredWrapper) {
        notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
      }
      
      if (needShot && hideScreenshot && typeof hideScreenshot.show === 'function') {
        hideScreenshot.show();
      } else if (!needShot && hideScreenshot && typeof hideScreenshot.hide === 'function') {
        hideScreenshot.hide();
        const screenshotContainer = modal.querySelector("#screenshotContainer");
        if (screenshotContainer) {
          screenshotContainer.style.border = "";
          screenshotContainer.classList.remove("invalid-field");
          const childElements = screenshotContainer.querySelectorAll("*");
          childElements.forEach(el => {
            el.style.border = "";
            el.classList.remove("invalid-field");
          });
        }
      }
      
      validateModalForm(modal, screenshotComp, formData, requireSupportFields);
    };
  }

  modal.querySelector("#cancelModal").onclick = async () => {
    if (hideScreenshot && typeof hideScreenshot === 'function') {
      hideScreenshot();
    }
    document.body.removeChild(modal);
  };

  const submitButton = modal.querySelector("#submitModal");
  if (submitButton) {
    submitButton.onclick = async () => {
      const hasErrors = validateModalForm(modal, screenshotComp, formData, requireSupportFields);
      if (hasErrors) return;

      const verifiedElement = modal.querySelector("#verified");
      const selectedVerificationType = verifiedElement ? verifiedElement.getAttribute('data-value') : "Empty";
      const notesRequired = modal.querySelector("#notesRequired")?.value || "";
      const notesOptional = modal.querySelector("#notesOptional")?.value || "";
      const supportNumber = modal.querySelector("#supportNumber")?.value || "Unavailable";

      let uploadedFiles = [];
      if (screenshotComp) {
        uploadedFiles = screenshotComp.getValue() || [];
      }

      if (requireSupportFields) {
        if (selectedVerificationType === "Not Verified" && !notesRequired.trim()) {
          alert("Please explain why not verified.");
          return;
        }
        if ((selectedVerificationType === "App" || selectedVerificationType === "Support") && uploadedFiles.length === 0) {
          alert("Screenshot is required for App or Support verification.");
          return;
        }
      }

      await onSubmit({
        selectedVerificationType,
        notesRequired,
        notesOptional,
        supportNumber,
        uploadedFiles
      });

      if (hideScreenshot && typeof hideScreenshot === 'function') {
        hideScreenshot();
      }
      document.body.removeChild(modal);
    };
  }

  const addInputListeners = (element) => {
    if (!element) return;

    const inputs = element.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('input', () => validateModalForm(modal, screenshotComp, formData, requireSupportFields));
      input.addEventListener('change', () => validateModalForm(modal, screenshotComp, formData, requireSupportFields));
    });
  };

  addInputListeners(modal);
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


// Add this at the top of your JS file (for example: reviewHelpers.js)
const customCSS = `
.no-scroll {
  overflow: hidden;
}
.custom-dropdown {
  width: 220px;
  position: relative;
}
.dropdown-list { display: none; }
.dropdown-list.open { display: block; }
.dropdown-label {
  display: block;
  font-weight: 500;
  margin-bottom: 6px;
}
.dropdown-selected {
  margin-top: -2px;
  border: 1px solid #888;
  border-radius: 5px;
  padding: 10px 32px 10px 10px;
  background: #fff;
  cursor: pointer;
  position: relative;
  min-height: 38px;
}
.dropdown-selected:after {
  position: absolute;
  right: 12px;
  font-size: 16px;
  color: #888;
}
.dropdown-list {
  position: absolute;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #888;
  border-radius: 5px;
  margin: 2px 0 0 0;
  z-index: 100;
  list-style: none;
  padding: 0;
  animation: fadeIn 0.2s;
}
.dropdown-list li {
  cursor: pointer;
  padding-left: 5px;
}
.dropdown-list li:hover,
.dropdown-list li.selected {
  background: #f0f4ff;
}
/* Optional: Animate dropdown open */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px);}
  to   { opacity: 1; transform: none; }
}
.dropdown-selected i.dropdown.icon {
 position: absolute;
 right: 10px;
 top: 50%;
 transform: translateY(-50%) rotate(45deg); /* arrow pointing down */
 border: solid #888;
 border-width: 0 2px 2px 0;
 padding: 4px;
 display: inline-block;
 pointer-events: none;
 transition: transform 0.2s ease;
}
.dropdown-selected .dropdown.icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

/* Rotate arrow when open */
.dropdown-selected.open i.dropdown.icon {
 transform: translateY(-50%) rotate(-135deg);
}

/* When dropdown is open, rotate arrow */
.custom-dropdown.open .dropdown.icon::before {
  transform: rotate(180deg);
}

`;

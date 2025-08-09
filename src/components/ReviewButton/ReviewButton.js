import { Components } from "@formio/js";
import editForm from "./ReviewButton.form";

const FieldComponent = Components.components.field;

export default class ReviewButton extends FieldComponent {
  static editForm = editForm;

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

  constructor(component, options, data) {
    super(component, options, data);
  }

  init() {
    super.init();
    this.root.on("submitDone", () => {
      window.location.reload();
    });
  }
  
  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {
      
      // Force a redraw and wait a moment for any pending updates to be applied
      try {
        this.root.redraw();
        
        // Small delay to ensure all components are updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Special handling for Hardware List datagrids - find and update them first
        const hardwareComponents = this.root.components.filter(comp => 
          comp.component.type === 'datagrid' && 
          (comp.component.key === 'hardwareList' || comp.component.label?.includes('Hardware'))
        );
        
        if (hardwareComponents.length > 0) {
          // Process each hardware component first
          for (const hardware of hardwareComponents) {
            try {
              // Force update the datagrid itself
              if (hardware.updateValue) {
                hardware.updateValue();
              }
              
              // Make sure all rows are updated
              if (hardware.rows) {
                hardware.rows.forEach((row, idx) => {
                  Object.values(row).forEach(component => {
                    if (component && component.updateValue) {
                      component.updateValue();
                    }
                  });
                });
              }
            } catch (e) {
              // Silent error handling
            }
          }
        }
        
        // Then update all other components
        this.root.components.forEach(comp => {
          if (comp.updateValue && typeof comp.updateValue === 'function') {
            try {
              comp.updateValue();
            } catch (e) {
              // Silent error handling
            }
          }
        });
      } catch (e) {
        // Silent error handling
      }
      
      // Get the latest data after refresh
      const allData = this.root.getValue();
      const noShow = allData?.data?.noShow;
      const supportNumber = allData?.data?.billingCustomer || "Unavailable";

      if (noShow === "yes") {
        const confirmed = confirm("Are you sure you want to submit without verification?");
        if (confirmed) {
          this.emit("submitButton", { type: "submit" });
        }
        return;
      }

      const visibleFields = this.root?.components?.filter(
        (comp) => {
          // Include component if reviewVisible is true OR if it contains data we want to show
          return (
            // Original criteria - explicitly marked as reviewVisible
            (comp.component.reviewVisible &&
            comp.visible !== false) ||
            
            // OR it's a container-like component that might have nested components with data
            (comp.component.type === 'datagrid' || 
             comp.component.type === 'container' ||
             comp.component.type === 'fieldset')
          );
        }
      );

      // Find special components that need special handling
      const specialComponents = this.root?.components?.filter(comp => 
        // Include all container-like components
        ['datagrid', 'container', 'fieldset', 'editgrid', 'nested'].includes(comp.component.type) && 
        comp.visible !== false
      );
      
      // Force these components to refresh their values
      specialComponents.forEach(comp => {
        try {
          // For datagrids, we need to ensure each row is current
          if (comp.component.type === 'datagrid' && comp.rows) {
            comp.rows.forEach((row, index) => {
              Object.values(row).forEach(component => {
                if (component.updateValue && typeof component.updateValue === 'function') {
                  component.updateValue();
                }
              });
            });
          }
          
          // Ensure component value is up-to-date
          if (comp.updateValue && typeof comp.updateValue === 'function') {
            comp.updateValue();
          }
          
          // Include in visible fields if not already there
          if (!visibleFields.includes(comp)) {
            visibleFields.push(comp);
          }
        } catch (e) {
          // Silent error handling
        }
      });
      
      const reviewHtml = visibleFields
        .map((comp) => {
          const key = comp.component.key;
          const label = comp.component.label || key;
          const value = comp.getValue();

            if (Array.isArray(value)) {
              // Special handling for hardware lists - ensure zero values are included
              const isHardwareList = label.includes('Hardware') || key === 'hardwareList';
              if (isHardwareList) {
                
                // For hardware lists, check if we need to add missing items with zero values
                try {
                  // Access the raw data directly from the component
                  if (comp.dataValue && Array.isArray(comp.dataValue)) {
                    // Ensure the raw data has proper representation
                    value = comp.dataValue.map((item, idx) => {
                      // For hardware fields, ensure zero values are preserved
                      const hardwareFields = ['hardwareProduct', 'snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'];
                      const enhancedItem = {...item};
                      
                      // Check if this is an item with empty form data - happens in second item
                      if (item.form && item.form.data && Object.keys(item.form.data).length === 0) {
                        // Add default zero values for hardware fields
                        hardwareFields.forEach(field => {
                          if (field !== 'hardwareProduct') { // Don't add hardwareProduct as 0
                            enhancedItem[field] = 0; // Assume 0 for all controls when empty
                          }
                        });
                      }
                      
                      // Also handle regular zero values
                      hardwareFields.forEach(field => {
                        if (item[field] === 0) {
                          enhancedItem[field] = 0; // Ensure 0 is preserved
                        }
                      });
                      
                      return enhancedItem;
                    });
                  }
                } catch (e) {
                  // Silent error handling
                }
              }
              
              // Special handling for datagrid/container-like components
              if (['datagrid', 'container', 'fieldset', 'editgrid', 'nested'].includes(comp.component.type)) {
                // Ensure we have the most current data
                if (comp.updateValue && typeof comp.updateValue === 'function') {
                  try {
                    comp.updateValue();
                    // Re-get the value after update
                    const refreshedValue = comp.getValue();
                    if (refreshedValue && Array.isArray(refreshedValue) && refreshedValue.length > 0) {
                      value = refreshedValue;
                    }
                  } catch (e) {
                    // Silent error handling
                  }
                }
              }            return `
    <div><strong>${label}:</strong></div>
    <ol style="padding-left: 1.5rem;">
      ${value
        .map((item, index) => {
          // Prefer direct item data
          let row = item.data || item.form?.data || item;
          
          // Check if row is empty (common in second items of hardware lists)
          if (row && Object.keys(row).length === 0) {
            // Check if we need to add default hardware control values
            const hardwareFields = ['hardwareProduct', 'snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'];
            
            // Create default values for hardware fields
            hardwareFields.forEach(field => {
              if (field !== 'hardwareProduct') { // Don't add hardwareProduct as 0
                row[field] = 0; // Add default value of 0 for all controls in empty items
              }
            });
          }
          
          // Try to find the corresponding component for this row if possible
          let rowComponent;
          if (comp.rows && comp.rows[index]) {
            rowComponent = comp.rows[index];
            
            // If we have a row component, ensure we get the freshest data
            if (rowComponent) {
              try {
                // Try to refresh each component in the row
                Object.values(rowComponent).forEach(component => {
                  if (component && component.component && component.updateValue) {
                    component.updateValue();
                  }
                });
                
                // Try to get an updated row value
                const freshRow = {};
                
                // First, get values from the components directly
                Object.entries(rowComponent).forEach(([key, component]) => {
                  if (component && component.component) {
                    const value = component.getValue();
                    if (value !== undefined) {
                      freshRow[component.component.key] = value;
                    }
                    
                    // For hardware fields, explicitly get 0 values too
                    const hardwareFields = ['snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'];
                    if (hardwareFields.includes(component.component.key) && value === 0) {
                      freshRow[component.component.key] = 0;
                    }
                  }
                });
                
                // For datagrids, also try to access the raw data directly
                if (comp.component.type === 'datagrid' && comp.dataValue && Array.isArray(comp.dataValue) && comp.dataValue[index]) {
                  // Extract hardware fields with special handling for zero values
                  const directRow = comp.dataValue[index];
                  const hardwareFields = ['hardwareProduct', 'snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'];
                  
                  // Check if this item has an empty form.data object
                  const hasEmptyFormData = directRow.form && 
                                         directRow.form.data && 
                                         Object.keys(directRow.form.data).length === 0;
                                          
                  if (hasEmptyFormData) {
                    // For empty form data, add default zero values for hardware controls
                    hardwareFields.forEach(field => {
                      if (field !== 'hardwareProduct') { // Don't set hardwareProduct to 0
                        freshRow[field] = 0;
                      }
                    });
                  }
                  
                  // Process regular fields
                  hardwareFields.forEach(field => {
                    // If the field exists in the direct data, add it
                    if (directRow[field] !== undefined) {
                      freshRow[field] = directRow[field];
                    }
                    // Also check nested form data
                    else if (directRow.form?.data?.[field] !== undefined) {
                      freshRow[field] = directRow.form.data[field];
                    }
                  });
                }
                
                // Merge the fresh data with the original row
                if (Object.keys(freshRow).length > 0) {
                  row = { ...row, ...freshRow };
                }
              } catch (e) {
                // Silent error handling
              }
            }
          }
          
          const itemComponents =
            comp?.components?.[index]?.components || comp.component.components || [];
            
          // Regular expression to identify internal/helper keys
          const INTERNAL_KEY_RE = /(DataSource|isDataSource|_raw|_meta|Controls)$/i;
          
          const filteredEntries = Object.entries(row).filter(([nestedKey, nestedValue]) => {
            // Skip internal/datasource fields
            if (INTERNAL_KEY_RE.test(nestedKey)) return false;
            
            // Always include these specific hardware list fields that we know we want to show
            // We want to show these even if they're 0
            const hardwareFields = ['hardwareProduct', 'snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'];
            if (hardwareFields.includes(nestedKey)) {
              // Even if the value is null or undefined, we'll show it for these specific fields
              // This ensures hardware fields always appear in the review
              return true;
            }
            
            // Don't filter out zeros or false - they're valid values (e.g. "snCtrl: 0")
            if (nestedValue === 0 || nestedValue === false) {
              return true;
            }
            
            // Skip null/empty values
            if (nestedValue === null || nestedValue === undefined || 
                (typeof nestedValue === 'string' && nestedValue === "")) return false;
            
            const nestedComponent = itemComponents.find(
              (c) => c.component?.key === nestedKey || c.key === nestedKey,
            );

            const nestedType = nestedComponent?.component?.type || nestedComponent?.type || "";
            const keyLower = nestedKey.toLowerCase();

            const likelyImageByName =
              keyLower.includes("pic") || keyLower.includes("photo") || keyLower.includes("image");
              
            // We'll handle arrays, but skip likely image fields
            return nestedType !== "image" && !likelyImageByName;
          });

          // Function to recursively process nested objects - for array items
          const renderNestedValue = (value, depth = 0) => {
            if (value === null || value === undefined || value === "") {
              return "";
            }
            
            // Skip internal objects
            if (typeof value === 'object' && !Array.isArray(value)) {
              // Don't traverse into DataSource objects
              if (Object.keys(value).some(k => INTERNAL_KEY_RE.test(k))) {
                return "(internal data)";
              }
              
              // Handle object
              const nestedEntries = Object.entries(value).filter(([key, val]) => {
                // Skip internal/helper keys
                if (INTERNAL_KEY_RE.test(key)) return false;
                return val !== null && val !== undefined || 
                  (typeof val === 'number' && val === 0) || 
                  val === false;
              });
              
              if (nestedEntries.length === 0) return "";
              
              return nestedEntries.map(([key, val]) => {
                const renderedValue = renderNestedValue(val, depth + 1);
                if (!renderedValue && typeof val !== 'number' && val !== false && val !== 0) return "";
                
                const displayValue = (typeof val !== 'object' || val === null) ? 
                  String(val) : renderedValue;
                  
                return `
                  <div style="margin-left: ${depth * 15}px; padding-left: 10px; border-left: 1px dotted #ccc;">
                    <strong>${key}:</strong> ${displayValue}
                  </div>`;
              }).join("");
            } else if (Array.isArray(value)) {
              // Handle array of objects
              if (value.length === 0) return "";
              
              if (typeof value[0] === 'object' && value[0] !== null) {
                return `
                <div style="margin-left: ${depth * 15}px;">
                  <ul style="list-style-type: circle; margin-left: ${depth * 10}px; padding-left: 15px;">
                    ${value.map((item, idx) => `
                      <li>Item ${idx + 1}:
                        ${renderNestedValue(item, depth + 1)}
                      </li>
                    `).join("")}
                  </ul>
                </div>`;
              } else {
                // Simple array values
                return value.join(", ");
              }
            } else {
              // Simple value
              return String(value);
            }
          };
          
          // For Item 2 in a hardware list, check for specific fields even if they appear empty
          if (filteredEntries.length === 0) {
            // Try to extract the keys we care about with explicit check for 0 values
            // This handles the specific case where fields have 0 values that might be filtered out
            const hardwareFields = ['hardwareProduct', 'snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'];
            const hardwareEntries = [];
            
            // Check if this is a hardware list item with empty form data
            const isEmptyHardwareItem = (label.includes('Hardware') || key === 'hardwareList') &&
                                       item.form && 
                                       item.form.data && 
                                       Object.keys(item.form.data).length === 0;
            
            if (isEmptyHardwareItem) {
              // For empty hardware items, always add the control fields with zero values
              ['snCtrl', 'imeiCtrl', 'camViewCtrl', 'cableCtrl'].forEach(field => {
                hardwareEntries.push([field, 0]);
              });
            }
            
            // Also check for regular fields
            hardwareFields.forEach(fieldKey => {
              // Explicitly check if the field exists and is 0 (we want to show these)
              if (row[fieldKey] === 0) {
                if (!hardwareEntries.some(entry => entry[0] === fieldKey)) {
                  hardwareEntries.push([fieldKey, 0]);
                }
              } else if (row[fieldKey] !== undefined && row[fieldKey] !== null && row[fieldKey] !== '') {
                if (!hardwareEntries.some(entry => entry[0] === fieldKey)) {
                  hardwareEntries.push([fieldKey, row[fieldKey]]);
                }
              }
            });
            
            // If we found hardware fields with 0 values, show them
            if (hardwareEntries.length > 0) {
              return `
                <li style="margin-bottom: 0.8rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
                  <div style="font-weight: bold; font-size: 1.05em; margin-bottom: 5px;">Item ${index + 1}</div>
                  <div style="padding-left: 15px;">
                    ${hardwareEntries
                      .map(
                        ([nestedKey, nestedValue]) =>
                          `<div style="margin-bottom: 4px;"><strong>${nestedKey}:</strong> ${nestedValue}</div>`
                      )
                      .join("")}
                  </div>
                </li>
              `;
            }
            
            // Otherwise show the default "no data" message
            return `
              <li style="margin-bottom: 0.8rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
                <div style="font-weight: bold; font-size: 1.05em; margin-bottom: 5px;">Item ${index + 1}</div>
                <div style="padding-left: 15px;"><em>No detailed information available</em></div>
              </li>
            `;
          }

          return `
            <li style="margin-bottom: 0.8rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;">
              <div style="font-weight: bold; font-size: 1.05em; margin-bottom: 5px;">Item ${index + 1}</div>
              <div style="padding-left: 15px;">
                ${filteredEntries
                  .map(
                    ([nestedKey, nestedValue]) =>
                      `<div style="margin-bottom: 4px;"><strong>${nestedKey}:</strong> ${renderNestedValue(nestedValue)}</div>`
                  )
                  .join("")}
              </div>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
          }

          if (value === null || value === "") return "";
          
          // Regular expression to identify internal/helper keys for top-level objects
          const INTERNAL_KEY_RE = /(DataSource|isDataSource|_raw|_meta|Controls)$/i;
          
          // Re-use the renderNestedValue function for top-level values as well
          const renderNestedValue = (value, depth = 0) => {
            
            if (value === null || value === undefined || value === "") {
              return "";
            }
            
            if (typeof value === 'object' && !Array.isArray(value)) {
              // Don't traverse into DataSource objects
              if (Object.keys(value).some(k => INTERNAL_KEY_RE.test(k))) {
                return "(internal data)";
              }
              
              // Handle object
              const nestedEntries = Object.entries(value).filter(([key, val]) => {
                // Skip internal/helper keys
                if (INTERNAL_KEY_RE.test(key)) return false;
                return val !== null && val !== undefined || 
                  (typeof val === 'number' && val === 0) || 
                  val === false;
              });
              
              if (nestedEntries.length === 0) return "";
              
              return nestedEntries.map(([key, val]) => {
                const renderedValue = renderNestedValue(val, depth + 1);
                // Allow zero values and boolean false values to display
                if (!renderedValue && typeof val !== 'number' && val !== false && val !== 0) return "";
                
                const displayValue = (typeof val !== 'object' || val === null) ? 
                  String(val) : renderedValue;
                  
                return `
                  <div style="margin-left: ${depth * 15}px; padding-left: 10px; border-left: 1px dotted #ccc;">
                    <strong>${key}:</strong> ${displayValue}
                  </div>`;
              }).join("");
            } else if (Array.isArray(value)) {
              // Handle array of objects
              if (value.length === 0) return "";
              
              if (typeof value[0] === 'object' && value[0] !== null) {
                return `
                <div style="margin-left: ${depth * 15}px;">
                  <ul style="list-style-type: circle; margin-left: ${depth * 10}px; padding-left: 15px;">
                    ${value.map((item, idx) => `
                      <li>Item ${idx + 1}:
                        ${renderNestedValue(item, depth + 1)}
                      </li>
                    `).join("")}
                  </ul>
                </div>`;
              } else {
                // Simple array values
                return value.join(", ");
              }
            } else {
              // Simple value
              return String(value);
            }
          };
          
          return `<div><strong>${label}:</strong> ${renderNestedValue(value)}</div>`;
        })
        .join("");

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
                <option value="">Select verification type</option>
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

      //Input file component into review modal
      const screenshotComp = this.root.getComponent("screenshot");
      if (screenshotComp) {
        screenshotComp.component.hidden = false;
        screenshotComp.visible = true;

        const html = screenshotComp.render();

        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const compEl = tmp.firstElementChild;

        const container = modal.querySelector("#screenshotContainer");
        container.appendChild(compEl);

        screenshotComp.attach(compEl);
      }

      const verifiedSelect = modal.querySelector("#verified");
      const screenshotWrapper = modal.querySelector("#screenshotWrapper");
      const notesOptionalWrapper = modal.querySelector("#notesOptionalWrapper");
      const notesRequiredWrapper = modal.querySelector("#notesRequiredWrapper");

      verifiedSelect.onchange = () => {
        const value = verifiedSelect.value;
        screenshotWrapper.style.display = value === "App" || value === "Support" ? "block" : "none";
        notesOptionalWrapper.style.display =
          value === "App" || value === "Support" ? "block" : "none";
        notesRequiredWrapper.style.display = value === "Not Verified" ? "block" : "none";
      };

      modal.querySelector("#cancelModal").onclick = () => {
        const screenshotComp = this.root.getComponent("screenshot");
        if (screenshotComp) {
          screenshotComp.component.hidden = true;
          if (typeof screenshotComp.setVisible === "function") {
            screenshotComp.setVisible(false);
          } else {
            screenshotComp.visible = false;
          }
          this.root.redraw();
        }

        document.body.removeChild(modal);
      };

      modal.querySelector("#submitModal").onclick = async () => {
        const verifiedSelectValue = modal.querySelector("#verified").value;
        const notesRequired = modal.querySelector("#notesRequired").value;
        const notesOptional = modal.querySelector("#notesOptional").value;
        const supportNumber = modal.querySelector("#supportNumber").value;
        const screenshotComp = this.root.getComponent("screenshot");
        const uploadedFiles = screenshotComp.getValue() || [];

        if (verifiedSelectValue === "Not Verified" && !notesRequired.trim()) {
          alert("Please explain why not verified.");
          return;
        }
        if (
          (verifiedSelectValue === "App" || verifiedSelectValue === "Support") &&
          uploadedFiles.length === 0
        ) {
          alert("Screenshot is required for App or Support verification.");
          return;
        }

        this.root.getComponent("reviewed")?.setValue("true");
        this.root.getComponent("supportNumber")?.setValue(supportNumber);
        this.root.getComponent("verifiedSelect")?.setValue(verifiedSelectValue);
        this.root.getComponent("notesOptional")?.setValue(notesOptional);
        this.root.getComponent("notesRequired")?.setValue(notesRequired);

        this.component._reviewModalCache = {
          verifiedSelect: verifiedSelectValue,
          notesRequired,
          notesOptional,
          supportNumber,
        };

        const requireValidation = noShow === "no";

        if (requireValidation) {
          const isValid = await this.root.checkValidity(this.root.getValue().data, true);
          if (!isValid) {
            this.root.showErrors();
            alert("Some fields are invalid. Please fix them before submitting.");
            return;
          }
        }

        document.body.removeChild(modal);
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

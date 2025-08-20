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
    
    if (this.root) {
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
      
      this.root.on("validateForm", async (callback) => {
        const results = await this.validateFormExternal();
        if (typeof callback === "function") {
          callback(results);
        }
        return results;
      });
      
      if (typeof window !== 'undefined') {
        window.formValidation = {
          validate: async (options) => await this.validateFormExternal(options),
          validateFields: async (fields, options) => await this.validateFields(fields, options),
          isValid: async () => await this.isFormValid()
        };
      }
    }
  }
  
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
        const firstError = this.root.element.querySelector('.formio-error-wrapper, .has-error, .is-invalid');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      return isValid;
    } catch (err) {
      console.error('Form validation error:', err);
      return false;
    }
  }

  async validateFormHard() {
    try {
      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            if (typeof c.setPristine === 'function') c.setPristine(false);
            if (typeof c.setDirty === 'function')   c.setDirty(true);
          } catch {}
        });
      }

      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      let isValid = true;
      if (typeof this.root?.checkValidity === 'function') {
        isValid = this.root.checkValidity(data, true);
      }

      if (!isValid && typeof this.root?.showErrors === 'function') {
        this.root.showErrors();
      }
      if (typeof this.root?.redraw === 'function') {
        await this.root.redraw();
      }

      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            if (c.component?.type === 'datagrid' && c.rows) {
              c.rows.forEach((row) => {
                Object.values(row).forEach((child) => {
                  if (child?.setPristine) child.setPristine(false);
                  if (child?.setDirty)    child.setDirty(true);
                });
              });
            }
          } catch {}
        });
      }

      if (!isValid) {
        const firstError = this.root?.element?.querySelector?.(
          '.formio-error-wrapper, .has-error, .is-invalid, [data-component-error="true"]'
        );
        if (firstError?.scrollIntoView) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      return !!isValid;
    } catch (e) {
      console.error('validateFormHard error', e);
      return false;
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
      const results = {
        isValid: true,
        fieldResults: {},
        errors: {},
        invalidComponents: []
      };
      
      const componentsToValidate = [];
      
      if (this.root?.everyComponent) {
        this.root.everyComponent((component) => {
          try {
            if (keys.includes(component.key) || keys.includes(component.path)) {
              componentsToValidate.push(component);
            }
          } catch {}
        });
      }
      
      for (const component of componentsToValidate) {
        const componentKey = component.key || component.path;
        const componentLabel = component.component?.label || componentKey;
        const componentPath = component.path || componentKey;
        
        if (typeof component.setPristine === 'function') component.setPristine(false);
        if (typeof component.setDirty === 'function') component.setDirty(true);
        
        const isValid = component.checkValidity ? component.checkValidity(component.data, true) : true;
        
        results.fieldResults[componentKey] = {
          isValid,
          errors: component.errors || [],
          label: componentLabel,
          path: componentPath
        };
        
        if (!isValid) {
          results.isValid = false;
          results.errors[componentKey] = {
            label: componentLabel,
            errors: component.errors || ['Invalid']
          };
          results.invalidComponents.push({
            component,
            path: componentPath,
            label: componentLabel
          });
          
          if (opts.showErrors && component.setCustomValidity) {
            component.setCustomValidity(component.errors, true);
          }
        }
      }
      
      if (opts.showErrors && typeof this.root?.redraw === 'function') {
        await this.root.redraw();
      }
      
      if (opts.scrollToError && !results.isValid && results.invalidComponents.length > 0) {
        const firstComponent = results.invalidComponents[0].component;
        if (firstComponent.element?.scrollIntoView) {
          firstComponent.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      
      return results;
    } catch (err) {
      console.error('Field validation error:', err);
      return {
        isValid: false,
        fieldResults: {},
        errors: { system: { label: 'System', errors: ['Field validation failed'] } },
        invalidComponents: []
      };
    }
  }
  
  async isFormValid() {
    try {
      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      let isValid = true;
      
      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            if (c.checkValidity && c.visible !== false && !c.disabled) {
              if (!c.checkValidity(c.data, false)) {
                isValid = false;
              }
            }
          } catch {}
        });
      }
      
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
      const results = {
        isValid: true,
        errorCount: 0,
        warningCount: 0,
        errors: {},
        warnings: {},
        invalidComponents: [],
        errorSummary: ''
      };

      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            if (typeof c.setPristine === 'function') c.setPristine(false);
            if (typeof c.setDirty === 'function') c.setDirty(true);
          } catch {}
        });
      }

      const data = this.root?.submission?.data ?? this.root?.data ?? {};
      
      const errorMap = new Map();
      const warningMap = new Map();
      
      if (this.root?.everyComponent) {
        this.root.everyComponent((component) => {
          try {
            if (!component.visible || component.disabled) return;
            
            if (component.checkValidity) {
              const isValid = component.checkValidity(component.data, true);
              
              if (!isValid) {
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
                
                if (opts.showErrors) {
                  component.setCustomValidity(component.errors, true);
                }
              }
              
              if (opts.includeWarnings && component.warnings && component.warnings.length) {
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
            }
          } catch (err) {
            console.error(`Error validating component ${component.key}:`, err);
          }
        });
      }
      
      results.errors = Object.fromEntries(errorMap);
      results.warnings = Object.fromEntries(warningMap);
      
      const errorSummaryLines = [];
      errorMap.forEach((data, path) => {
        data.errors.forEach(error => {
          errorSummaryLines.push(`${data.label}: ${error}`);
        });
      });
      results.errorSummary = errorSummaryLines.join('\n');
      
      if (opts.showErrors && typeof this.root?.redraw === 'function') {
        await this.root.redraw();
        
        if (!results.isValid && typeof this.root?.showErrors === 'function') {
          this.root.showErrors();
        }
        
        if (opts.scrollToError && !results.isValid) {
          const firstError = this.root?.element?.querySelector?.(
            '.formio-error-wrapper, .has-error, .is-invalid, [data-component-error="true"]'
          );
          if (firstError?.scrollIntoView) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
      
      return results;
    } catch (err) {
      console.error('External form validation error:', err);
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
      const errorSummaryEl = document.createElement('div');
      errorSummaryEl.className = 'alert alert-danger validation-summary';
      errorSummaryEl.style.position = 'fixed';
      errorSummaryEl.style.top = '20px';
      errorSummaryEl.style.left = '50%';
      errorSummaryEl.style.transform = 'translateX(-50%)';
      errorSummaryEl.style.zIndex = '9999';
      errorSummaryEl.style.maxWidth = '80%';
      errorSummaryEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      
      errorSummaryEl.innerHTML = `
        <h4>Form Validation Errors</h4>
        <button type="button" class="close" style="position: absolute; top: 5px; right: 10px;">&times;</button>
        <p>Please fix the following errors:</p>
        <ul>
          ${Object.values(results.errors)
            .flatMap(item => item.errors.map(error => `<li>${item.label}: ${error}</li>`))
            .join('')}
        </ul>
      `;
      
      document.body.appendChild(errorSummaryEl);
      
      const closeButton = errorSummaryEl.querySelector('.close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          document.body.removeChild(errorSummaryEl);
        });
      }
      
      setTimeout(() => {
        if (document.body.contains(errorSummaryEl)) {
          document.body.removeChild(errorSummaryEl);
        }
      }, 10000);
    }
    
    return results;
  }

  render() {
    return super.render(
      `<button ref="button" type="button" class="btn btn-primary" style="width: 100% !important;">${this.component.label}</button>`,
    );
  }

  attach(element) {
    this.loadRefs(element, { button: "single" });

    this.addEventListener(this.refs.button, "click", async () => {
      const validation = await this.validateFormExternal({
        showErrors: true,
        scrollToError: true
      });
      console.log("Form validation results:", validation);
      
      if (!validation.isValid) {
        if (validation.errorCount > 0) {
          alert(`Please fix the following errors before proceeding:\n\n${validation.errorSummary}`);
        }
        return;
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const allDatagrids = [];
        this.root.everyComponent(comp => {
          if (comp.component?.type === 'datagrid') {
            allDatagrids.push(comp);
          }
        });
        for (const datagrid of allDatagrids) {
          try {
            if (datagrid.updateValue) {
              datagrid.updateValue();
            }
            if (datagrid.rows) {
              datagrid.rows.forEach(row => {
                Object.values(row).forEach(component => {
                  if (component && component.updateValue) {
                    component.updateValue();
                  }
                });
              });
            }
          } catch (e) {}
        }
        this.root.components.forEach(comp => {
          if (comp.updateValue && typeof comp.updateValue === 'function') {
            try {
              comp.updateValue();
            } catch (e) {}
          }
        });
      } catch (e) {}



      // Collect reviewVisible leaves and container labels
      async function collectReviewLeavesAndLabels(root) {
        if (root.ready) await root.ready;
        const leaves = [];
        const labelByPathMap = new Map();
        const suppressLabelForKey = new Set(['data', 'dataGrid']);
        const queue = [];
        const enqueueAll = (f) => f.everyComponent && f.everyComponent((c) => queue.push(c));
        enqueueAll(root);

        while (queue.length) {
          const comp = queue.shift();
          if (!comp) continue;

          if (comp.type === 'form') {
            if (comp.subFormReady) await comp.subFormReady;
            if (comp.subForm) {
              enqueueAll(comp.subForm);
              const title = comp.formObj?.title || comp.component?.label || comp.key || 'Form';
              labelByPathMap.set(comp.path, title);
            } else {
              // If subForm is missing, fallback to datagrid or component label
              if (comp.component?.type === 'datagrid') {
                labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'List');
              } else {
                labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'Form');
              }
            }
            continue;
          }

          if (comp.component?.type === 'datagrid' && comp.rows) {
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'List');
            comp.rows.forEach((row, rIdx) => {
              Object.values(row).forEach((child) => {
                if (child) {
                  child.__reviewPath = `${comp.path}[${rIdx}].${child.path?.slice(comp.path.length + 1) || child.key}`;
                  // If this is a nested form within a datagrid row, set its label in the map
                  if (child.type === 'form') {
                    const formPath = child.__reviewPath;
                    const formTitle = child.formObj?.title || child.component?.label || child.key || 'Form';
                    labelByPathMap.set(formPath, formTitle);
                  }
                  queue.push(child);
                }
              });
            });
            continue;
          }

          if (comp.component?.type === 'datagrid' && !comp.rows) {
            // Ensure datagrid labels are set even if rows are absent
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'List');
            continue;
          }

          if (comp.component?.type === 'editgrid' && comp.editRows?.length) {
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'Items');
            comp.editRows.forEach((r, rIdx) => (r.components || []).forEach((ch) => {
              ch.__reviewPath = `${comp.path}[${rIdx}].${ch.path?.slice(comp.path.length + 1) || ch.key}`;
              queue.push(ch);
            }));
            continue;
          }

          if (Array.isArray(comp.components) && comp.components.length) {
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || '');
            comp.components.forEach((ch) => queue.push(ch));
            continue;
          }

          if (comp.component?.reviewVisible === true && comp.visible !== false) {
            leaves.push({
              comp,
              path: comp.__reviewPath || comp.path || comp.key,
              label: comp.component?.label || comp.key,
              value: 'getValue' in comp ? comp.getValue() : comp.dataValue,
            });
          }
        }
        // Convert Map to plain object more safely
        const labelByPath = {};
        labelByPathMap.forEach((value, key) => {
          labelByPath[key] = value;
        });
        return { leaves, labelByPath, suppressLabelForKey };
      }

      // Build readable HTML tree using labels
      function renderLeaves(leaves, labelByPath, suppressLabelForKey) {
        const root = {};
        const ensureNode = (obj, k) => (obj[k] ??= { __children: {}, __rows: {}, __label: null, __suppress: false });

        function setNodeLabelForPath(node, containerPath) {
          if (!node.__label && labelByPath && typeof labelByPath === 'object' && containerPath in labelByPath) {
            node.__label = labelByPath[containerPath];
          }
        }

        // helper: make values pretty, especially files/images
        function formatValue(value, comp) {
          const isFileish =
            comp?.component?.type === 'file' ||
            comp?.component?.type === 'image' ||
            comp?.component?.storage ||
            comp?.component?.filePattern;


          // Handle select boxes with multiple selections
          if (comp?.component?.type === "selectboxes") {
            // Format 1: {"value1":true,"value2":true} - object with boolean flags
            if (Object.values(value).some(v => typeof v === 'boolean')) {
              const selectedValues = Object.keys(value).filter(key => value[key] === true);
              if (selectedValues.length) {
                // Only show values set to true
                return selectedValues.join(', ');
              } else {
                // If all values are false, show "None selected"
                return "";
              }
            }
            
            // Format 2: If the value is an array of objects with label/value properties
            if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
              if ('label' in value[0] || 'value' in value[0]) {
                const selectedItems = value.filter(item => item.selected || item.checked);
                if (selectedItems.length) {
                  return selectedItems.map(item => item.label || item.value).join(', ');
                } else {
                  return "";
                }
              }
            }
          }
          
          if (Array.isArray(value)) {
            if (isFileish && value.length && typeof value[0] === 'object') {
              // Try common name fields from Form.io file objects
              const names = value.map(v =>
                v?.originalName || v?.name || v?.fileName || v?.path || '[file]'
              );
              return names.join(', ');
            }
            return value.join(', ');
          }

          if (value && typeof value === 'object') {
            if (isFileish) {
              return value.originalName || value.name || value.fileName || '[file]';
            }
            // fallback so you never see [object Object]
            try { return JSON.stringify(value); } catch { return String(value); }
          }
          
          

          if (value === false) return 'No';
          if (value === true) return 'Yes';
          return value ?? '';
        }

        for (const { path, label, value, comp } of leaves) {
          // AFTER: drop empty bits and stray "0]", "1]", "2]" tokens
          const parts = path
            .replace(/\.data\./g, '.')
            .split('.')
            .filter(Boolean)
            .filter(seg => !/^\d+\]$/.test(seg));
          let ptr = root;
          let containerPath = '';

          for (let i = 0; i < parts.length; i++) {
            const seg = parts[i];
            const idxMatch = seg.match(/\[(\d+)\]/);
            const key = seg.replace(/\[\d+\]/g, '');
            containerPath = containerPath ? `${containerPath}.${key}` : key;

            const node = ensureNode(ptr, key);
            if (suppressLabelForKey.has(key)) node.__suppress = true;
            setNodeLabelForPath(node, containerPath);

            if (idxMatch) {
              const idx = Number(idxMatch[1]);
              node.__rows[idx] ??= { __children: {} };
              ptr = node.__rows[idx].__children;
            } else if (i === parts.length - 1) {
              ptr[key] = { __leaf: true, __label: label, __value: value, __comp: comp };
            } else {
              ptr = node.__children;
            }
          }
        }

          const renderNode = (node, depth = 0) => {
          const pad = `margin-left:${depth * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;
          return Object.entries(node).map(([k, v]) => {
            // Ignore stray numeric bracket tokens like "0]" if any slipped through
            if (/^\d+\]$/.test(k)) {
              return v && typeof v === 'object'
                ? renderNode(v.__children || {}, depth)
                : '';
            }
            if (v && v.__leaf) {
              const val = formatValue(v.__value, v.__comp);
              return `<div style="${pad}"><strong>${v.__label || k}:</strong> ${val}</div>`;
            }
            if (v && typeof v === 'object') {
              const hasChildren = v.__children && Object.keys(v.__children).length;
              const hasRows = v.__rows && Object.keys(v.__rows).length;
              const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k));
              const header = displayLabel ? `<div style="${pad}"><strong>${displayLabel}:</strong>` : `<div style="${pad}">`;
              const childrenHtml = [
                hasRows
                  ? `<ul style="list-style-type:circle; padding-left:15px; margin:0;">${
                      Object.entries(v.__rows).map(([i, r]) => {
                        // Each row may contain a form or other nested components with their own labels
                        return `<li>Item ${Number(i)+1}:${renderNode(r.__children, depth + 1)}</li>`;
                      }).join('')
                    }</ul>` : '',
                hasChildren ? renderNode(v.__children, depth + 1) : ''
              ].join('');
              return `${header}${childrenHtml}</div>`;
            }
            return '';
          }).join('');
        };
        
        return renderNode(root, 0);
      }


      // --- USAGE inside your click handler (replace your current leaves/html logic):
      const { leaves, labelByPath, suppressLabelForKey } = await collectReviewLeavesAndLabels(this.root);
      // labelByPath is already a plain object, no need for conversion
      const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey);

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

      modal.querySelector("#cancelModal").onclick = () => {
        hideScreenshot();
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
          console.log("Invalid field: verified, Value:", selectedVerificationType);
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
          console.log("Invalid field: supportNumber, Value:", supportNumberElement.value);
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
              console.log("Invalid field: screenshot, No files uploaded");
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
            console.log("Invalid field: notesRequired, Value:", notesRequiredElement.value);
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

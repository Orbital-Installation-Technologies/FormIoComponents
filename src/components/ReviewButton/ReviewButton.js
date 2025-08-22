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
        
        // Log entire form structure before review processing
        console.log("========== COMPLETE FORM STRUCTURE ==========");
        
        // Create a deep copy for safe logging, avoiding circular references
        const safeRoot = {};
        
        // Log form-level properties
        safeRoot.type = this.root.type;
        safeRoot.form = this.root.form;
        safeRoot.display = this.root.display;
        safeRoot.options = {...this.root.options};
        safeRoot.components = this.root.components ? this.root.components.length : 0;
        safeRoot.data = JSON.parse(JSON.stringify(this.root.data || {}));
        
        console.log("Root Form Structure:", safeRoot);
        
        // Map to store component types and counts
        const compTypeCount = {};
        
        // Collect component structures
        const allComponents = [];
        const componentTree = {};
        let currentPath = [];
        
        // Helper function to safely extract component info
        const extractComponentInfo = (comp) => {
          try {
            // Count component types
            const type = comp.component?.type || comp.type || 'unknown';
            compTypeCount[type] = (compTypeCount[type] || 0) + 1;
            
            return {
              key: comp.key,
              path: comp.path,
              type: type,
              label: comp.component?.label || comp.label || comp.key || 'Unlabeled',
              hasValue: comp.hasValue ? true : false,
              value: comp.hasValue ? (
                // Try to safely extract value
                typeof comp.getValue === 'function' ? 
                  ((() => {
                    try { 
                      const val = comp.getValue();
                      return typeof val === 'object' ? '<complex value>' : val;
                    } catch(e) {
                      return '<error getting value>';
                    }
                  })()) : '<has value but no getValue>'
              ) : '<no value>',
              hasChildren: !!(comp.components?.length || 
                              comp.rows?.length || 
                              comp.savedRows?.length || 
                              comp.columns?.length)
            };
          } catch(e) {
            return {
              error: 'Error extracting component info',
              message: e.message
            };
          }
        };
        
        // First pass - create flat list of all components with basic info
        this.root.everyComponent(comp => {
          const info = extractComponentInfo(comp);
          allComponents.push(info);
        });
        
        console.log("All Form Components:", allComponents);
        console.log("Component Types Summary:", compTypeCount);
        
        // Now continue with original logic - collect datagrids and datatables
        const allDatagrids = [];
        this.root.everyComponent(comp => {
          // Keep original logging
          console.log("Comp", comp)
          console.log("Component type:", comp.component?.type)
          if (comp.component?.type === 'datagrid' || comp.component?.type === 'datatable') {
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
            } catch (e) {}
          }
        });
      } catch (e) {}



      // Collect reviewVisible leaves and container labels
      async function collectReviewLeavesAndLabels(root) {
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

        console.log("Starting collectReviewLeavesAndLabels");
        if (root.ready) await root.ready;
        const leaves = [];
        const labelByPathMap = new Map();
        const metaByPathMap = new Map();
        const indexByPathMap = new Map(); // containerPath -> top-level index
        const suppressLabelForKey = new Set(['data']);
        const queue = [];
        const processedPaths = new Set();
        
        // Statistics for logging
        const stats = {
          totalComponents: 0,
          byType: {},
          containers: 0,
          leafComponents: 0,
          skippedComponents: 0
        };
        
        const enqueueAll = (f) => {
          if (f.everyComponent) {
            f.everyComponent((c) => {
              queue.push(c);
              stats.totalComponents++;
              stats.byType[c.component?.type || c.type || 'unknown'] = 
                (stats.byType[c.component?.type || c.type || 'unknown'] || 0) + 1;
            });
          }
        };
        
        console.log("Enqueuing root components");
        enqueueAll(root);
        console.log(`Initial queue size: ${queue.length}`);

        let processedCount = 0;
        const logInterval = Math.max(10, Math.floor(queue.length / 10)); // Log every 10% of components
        
        while (queue.length) {
          const comp = queue.shift();
          if (!comp) continue;
          
          processedCount++;
          if (processedCount % logInterval === 0 || processedCount === stats.totalComponents) {
            console.log(`Processed ${processedCount}/${stats.totalComponents} components (${Math.round(processedCount/stats.totalComponents*100)}%)`);
          }
          
          // Avoid processing the same component twice
          if (comp.path && processedPaths.has(comp.path)) {
            stats.skippedComponents++;
            continue;
          }
          if (comp.path) processedPaths.add(comp.path);

          if (comp.type === 'form') {
            if (comp.subFormReady) await comp.subFormReady;
            if (comp.subForm) {
              enqueueAll(comp.subForm);
              const title = comp.formObj?.title || comp.component?.label || comp.key || 'Form';
              labelByPathMap.set(comp.path, title);
              indexByPathMap.set(comp.path, topIndexFor(comp));
            } else {
              // If subForm is missing, fallback to datagrid, datatable or component label
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
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'List');
            indexByPathMap.set(comp.path, topIndexFor(comp));

            // Capture leaf columns for this datagrid (used for the review view)
            // First check if we have comp.columns (from the console.log)
            let colDefs = [];
            
            if (comp.columns && Array.isArray(comp.columns)) {
              // Use columns property if available
              colDefs = comp.columns;
              console.log("Using DataGrid columns property:", colDefs);
            } else if (comp.components && Array.isArray(comp.components)) {
              // Fall back to components
              colDefs = comp.components.filter(c =>
                c?.input !== false &&
                !['panel','form','container','columns','datagrid','editgrid'].includes(c.type)
              );
              console.log("Using DataGrid components property:", colDefs);
            }
            
            const columnKeys = colDefs.map(c => c.key || c.path || c.component?.key || '');
            const columnLabels = colDefs.map(c => c.label || c.component?.label || c.key || '');
            
            console.log(`DataGrid metadata for ${comp.path}:`, {
              colDefs,
              columnKeys,
              columnLabels,
              componentObj: comp
            });
            
            metaByPathMap.set(comp.path, {
              kind: comp.component?.type === 'datatable' ? 'datatable' : 'datagrid',
              columnKeys,
              columnLabels
            });

            // For DataTable, use savedRows instead of rows
            const rowsToProcess = comp.component?.type === 'datatable' && Array.isArray(comp.savedRows) ? 
              comp.savedRows.map(row => ({ ...row, components: row.components || [] })) : 
              comp.rows;
              
            if (rowsToProcess && rowsToProcess.length) {
              console.log(`Processing ${comp.component?.type} rows for ${comp.path}:`, rowsToProcess);
              
              rowsToProcess.forEach((row, rIdx) => {
                console.log(`Row ${rIdx} contents:`, row);
                
                // For DataTable, process row.components; for DataGrid, process the row object directly
                const rowComponents = comp.component?.type === 'datatable' ? row.components : Object.values(row);
                
                rowComponents.forEach((child) => {
                  if (child) {
                    const childKey = child?.key || child?.component?.key || child?.path?.split('.').pop() || 'value';
                    child.__reviewPath = `${comp.path}[${rIdx}].${childKey}`;
                    console.log(`Child in row ${rIdx}:`, {
                      key: child.key,
                      type: child.type,
                      path: child.path,
                      reviewPath: child.__reviewPath
                    });
                    
                    // If this is a nested form within a row, set its label in the map
                    if (child.type === 'form') {
                      const formPath = child.__reviewPath;
                      const formTitle = child.formObj?.title || child.component?.label || child.key || 'Form';
                      labelByPathMap.set(formPath, formTitle);
                    }
                    queue.push(child);
                  }
                });
              });
            } else {
              console.log(`${comp.component?.type} ${comp.path} has no rows`);
            }
            continue;
          }

          if ((comp.component?.type === 'datagrid' && !comp.rows) || 
              (comp.component?.type === 'datatable' && !comp.savedRows)) {
            // Ensure datagrid/datatable labels are set even if rows are absent
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'List');
            continue;
          }

          // Handle EditGrid
          if (comp.component?.type === 'editgrid' && Array.isArray(comp.editRows) && comp.editRows.length) {
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'Items');
            indexByPathMap.set(comp.path, topIndexFor(comp));

            comp.editRows.forEach((r, rIdx) => (r.components || []).forEach((ch) => {
              ch.__reviewPath = `${comp.path}[${rIdx}].${ch.key || 'value'}`;
              queue.push(ch);
            }));
            continue;
          }

          // ---- Tagpad (fix: expand editForms -> fields)
          if (comp.component?.type === 'tagpad') {
            // Tagpad container label
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || 'Tagpad');

            const forms = Array.isArray(comp.editForms) ? comp.editForms : [];
            const tagpadArray = Array.isArray(comp._data?.tagpad) ? comp._data.tagpad : [];

            forms.forEach((form, idx) => {
              const basePath = `${comp.path}[${idx}]`;
              const formLabel = `Tag ${idx + 1}`;
              labelByPathMap.set(basePath, formLabel);

              // Prefer the edit form's data; fall back to the tagpad array slot
              const formData = (form && form.data) ? form.data : (tagpadArray[idx] || {});
              const formComps = Array.isArray(form?.components) ? form.components : [];

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
                  value: val
                });
              });
            });

            // Don't traverse comp.components for tagpad to avoid duplicates
            continue;
          }

          if (Array.isArray(comp.components) && comp.components.length) {
            labelByPathMap.set(comp.path, comp.component?.label || comp.key || '');
            indexByPathMap.set(comp.path, topIndexFor(comp));
            comp.components.forEach((ch) => queue.push(ch));
            continue;
          }

          const isContainer = Array.isArray(comp.components) && comp.components.length > 0;
          const isInputish =
            comp?.component?.input !== false &&
            !isContainer &&
            comp?.type !== 'button' &&
            comp?.type !== 'panel';

          const parent = comp?.parent;
          const parentType = parent?.component?.type;
          
          // Check if component is inside a TagPad form
          const isInTagpadForm = 
            parent && parentType === 'tagpad' && 
            comp.__reviewPath && comp.__reviewPath.includes('[') && comp.__reviewPath.includes(']');

          // inside a repeating container?
          const inRepeater =
            parentType === 'editgrid' ||
            parentType === 'datagrid' ||
            parentType === 'datatable' ||
            parentType === 'tagpad' ||            
            isInTagpadForm ||                     // Component is in a TagPad form
            Array.isArray(parent?.rows) ||        // datagrid-like
            Array.isArray(parent?.savedRows) ||   // datatable specific
            Array.isArray(parent?.editForms) ||   // TagPad edit forms array
            Array.isArray(parent?.editRows);      // editgrid-like
            
          // Always include Tagpad components regardless of visibility
          const isTagpadComponent = comp.type === 'tagpad' || comp.component?.type === 'tagpad' || isInTagpadForm;

          // Skip content and htmlelement components
          const isContentComponent = 
            comp?.component?.type === 'content' || 
            comp?.component?.type === 'htmlelement' || 
            comp?.type === 'content' ||
            comp?.type === 'htmlelement';
            
          // include if explicitly reviewVisible OR it's a normal input inside a grid OR it's a tagpad component
          // BUT exclude content and HTML components
          if (
            !isContentComponent &&
            (comp.visible !== false || isTagpadComponent) &&
            (comp.component?.reviewVisible === true || (isInputish && inRepeater) || isTagpadComponent)
          ) {
            // Get formIndex from top-level ancestor
            const formIndex = topIndexFor(comp);
            
            leaves.push({
              comp,
              path: comp.__reviewPath || comp.path || comp.key,
              label: comp.component?.label || comp.key,
              value: 'getValue' in comp ? comp.getValue() : comp.dataValue,
              formIndex: formIndex // Store original index from form.components
            });
          }
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
        
        // Log collection statistics
        console.log("Collection complete!", {
          stats,
          leafCount: leaves.length,
          containerCount: labelByPathMap.size,
          metadataCount: metaByPathMap.size,
          indexCount: indexByPathMap.size,
          suppressedKeys: Array.from(suppressLabelForKey)
        });
        
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
        
        console.log("Grid Component Stats:", {
          dataGrids: dataGridStats,
          dataTables: dataTableStats
        });
        
        return { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath };
      }

      // Build readable HTML tree using labels
      function renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath) {
        console.log("Original leaves order:", leaves.map(l => ({ 
          path: l.path, 
          label: l.label,
          formIndex: l.formIndex
        })));
        
        // Sort leaves based on their original position in form.components
        const sortedLeaves = [...leaves].sort((a, b) => {
          // If both have valid formIndex, sort by that
          if (a.formIndex >= 0 && b.formIndex >= 0) {
            return a.formIndex - b.formIndex;
          }
          // If only one has valid formIndex, prioritize it
          if (a.formIndex >= 0) return -1;
          if (b.formIndex >= 0) return 1;
          
          // Otherwise, keep original order
          return 0;
        });
        
        console.log("Sorted leaves order:", sortedLeaves.map(l => ({ 
          path: l.path, 
          label: l.label,
          formIndex: l.formIndex
        })));
        
        const root = {};
        const ensureNode = (obj, k) => (obj[k] ??= {
          __children: {}, __rows: {}, __label: null, __suppress: false,
          __kind: null, __colKeys: null, __colLabels: null,
          __formIndex: -1 // Add form index to track original order
        });

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
          if (value === true)  return 'Yes';
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

        // ---- build tree from leaf paths
        for (const { path, label, value, comp, formIndex } of sortedLeaves) {
          const parts = path
            .replace(/\.data\./g, '.')
            .split('.')
            .filter(Boolean)
            // ignore tokens like "0]" (already handled by [idx]) AND bare "0"
            .filter(seg => !/^\d+\]$/.test(seg) && !/^\d+$/.test(seg));
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
          setNodeMetaForPath(node, containerPath);
          setNodeIndexForPath(node, containerPath);            // Store formIndex for sorting
            if (formIndex >= 0 && (node.__formIndex === -1 || formIndex < node.__formIndex)) {
              node.__formIndex = formIndex;
            }

            if (idxMatch) {
              const idx = Number(idxMatch[1]);
              node.__rows[idx] ??= { __children: {} };
              ptr = node.__rows[idx].__children;
            } else if (i === parts.length - 1) {
              ptr[key] = { 
                __leaf: true, 
                __label: label, 
                __value: value, 
                __comp: comp, 
                __formIndex: formIndex 
              };
            } else {
              ptr = node.__children;
            }
          }
        }

        // ---- render tree
        const renderNode = (node, depth = 0) => {
          const pad = `margin-left:${depth * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;
          
          // Sort entries based on formIndex
          const sortedEntries = Object.entries(node).sort((a, b) => {
            const aIndex = a[1]?.__formIndex ?? -1;
            const bIndex = b[1]?.__formIndex ?? -1;
            
            // If both have valid formIndex, sort by that
            if (aIndex >= 0 && bIndex >= 0) {
              return aIndex - bIndex;
            }
            // If only one has valid formIndex, prioritize it
            if (aIndex >= 0) return -1;
            if (bIndex >= 0) return 1;
            
            // Otherwise, alphabetical by key (original behavior)
            return a[0].localeCompare(b[0]);
          });
          
          return sortedEntries.map(([k, v]) => {
            // ignore stray tokens
            if (/^\d+\]$/.test(k)) {
              return v && typeof v === 'object' ? renderNode(v.__children || {}, depth) : '';
            }

            if (v && v.__leaf) {
              const val = firstLeafVal(v);
              // Check if this is a tagpad form entry from path - simplified check to avoid potential recursion
              const isTagpadDot = v.__label?.startsWith('Tag ') || 
                                 (v.__comp?.type === 'tagpad') ||
                                 (v.__comp?.parent?.type === 'tagpad');
              
              if (isTagpadDot) {
                // For tagpad forms, simplify to just show label: value (without nested divs)
                // If the value is a simple number, show it directly
                return `<div style="${pad}"><strong>${v.__label || k}:</strong> ${val}</div>`;
              } else {
                // Normal rendering for other leaf nodes
                return `<div style="${pad}"><strong>${v.__label || k}:</strong> ${val}</div>`;
              }
            }

            if (v && typeof v === 'object') {
              const hasChildren = v.__children && Object.keys(v.__children).length;
              const hasRows = v.__rows && Object.keys(v.__rows).length;
              const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k));
              const header = displayLabel ? `<div style="${pad}"><strong>${displayLabel}:</strong>` : `<div style="${pad}">`;

              // ---- DataGrid/DataTable: render as Rows -> Columns -> fields
              if ((v.__kind === 'datagrid' || v.__kind === 'datatable') && hasRows) {
                // which columns are present across rows?
                const presentKeys = new Set();
                Object.values(v.__rows).forEach(r => {
                  Object.keys(r.__children || {}).forEach(cKey => presentKeys.add(cKey));
                });

                // keep schema order if we have it
                const orderedKeys = Array.isArray(v.__colKeys) && v.__colKeys.length
                  ? v.__colKeys.filter(cKey => presentKeys.has(cKey))
                  : Array.from(presentKeys);

                const labelByKey = new Map(
                  (v.__colKeys || []).map((cKey, i) => [cKey, (v.__colLabels || [])[i] || cKey])
                );

                const rowIdxs = Object.keys(v.__rows).map(n => Number(n)).sort((a,b)=>a-b);
                const rowsHtml = rowIdxs.map((rowIdx) => {
                  const row = v.__rows[rowIdx];
                  const haveMultiCols = orderedKeys.length > 1;

                  // indent for "Column" lines
                  const padRow = `margin-left:${(depth + 1) * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;
                  const padCol = `margin-left:${(depth + 2) * 15}px; padding-left:10px; border-left:1px dotted #ccc;`;

                  if (haveMultiCols) {
                    const colsHtml = orderedKeys.map((colKey, colIdx) => {
                      const cell = row.__children[colKey];
                      let cellContent = '';
                      if (!cell) {
                        cellContent = '<div style="'+padCol+'">(empty)</div>';
                      } else if (cell.__leaf) {
                        const val = firstLeafVal(cell);
                        cellContent = `<div style="${padCol}"><strong>${cell.__label || labelByKey.get(colKey) || colKey}:</strong> ${val}</div>`;
                      } else {
                        // list any leaves under this column (labels + values)
                        const inner = renderNode(cell.__children || {}, depth + 2);
                        cellContent = inner || `<div style="${padCol}">(empty)</div>`;
                      }
                      return `<div style="${padCol}"><em>Column ${colIdx+1}</em>${innerSpacer()}</div>${cellContent}`;
                    }).join('');

                    return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;','')}">Row ${rowIdx+1}:${colsHtml}</li>`;
                  } else {
                    // single-column grid → just render the cell contents under the row
                    const onlyKey = orderedKeys[0];
                    const cell = row.__children[onlyKey];
                    const inner = cell?.__leaf
                      ? `<div style="${padRow}"><strong>${cell.__label || labelByKey.get(onlyKey) || onlyKey}:</strong> ${firstLeafVal(cell)}</div>`
                      : renderNode(cell?.__children || {}, depth + 1);
                    return `<li style="margin-left:0 !important; padding-left: 0 !important;${padRow.replace('border-left:1px dotted #ccc;','')}">Row ${rowIdx+1}:${inner}</li>`;
                  }
                }).join('');

                return `${header}<ul style="list-style-type:circle; padding-left:30px; margin:0;">${rowsHtml}</ul></div>`;
              }

              // ---- default rendering
              const childrenHtml = [
                hasRows
                  ? `<ul style="list-style-type:circle; padding-left:30px; margin:0;">${
                      Object.entries(v.__rows).map(([i, r]) => {
                        // For tagpad components, show "Tag X" instead of "Row X"
                        const isTagpad = k === 'tagpad' || v.__label === 'Tagpad';
                        const rowLabel = isTagpad ? `Tag ${Number(i)+1}` : `Row ${Number(i)+1}`;
                        return `<li style="margin-left:0 !important; padding-left: 0 !important;">${rowLabel}:${renderNode(r.__children, depth + 1)}</li>`;
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
        function innerSpacer(){ return `<span style="display:block;height:2px;"></span>`; }
        
        // Log the structured tree for debugging
        console.log("Final review structure tree:", JSON.parse(JSON.stringify(root, (key, value) => {
          // Filter out certain properties to make the log more readable
          if (key === '__comp') return undefined;
          if (typeof value === 'function') return '[Function]';
          return value;
        })));

        return renderNode(root, 0);
      }


      // --- USAGE inside your click handler (replace your current leaves/html logic):
      console.log("========== REVIEW PROCESSING BEGINS ==========");
      console.time("collectReviewLeavesAndLabels");
      
      const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } = 
        await collectReviewLeavesAndLabels(this.root);
      
      console.timeEnd("collectReviewLeavesAndLabels");
      console.log("========== REVIEW COLLECTION COMPLETE ==========");
      
      // Log the label map for debugging
      console.log("Label Map:", labelByPath);
      console.log("Meta By Path:", metaByPath);
      console.log("Suppress Label For Key:", suppressLabelForKey);
      
      // Log leaves with more detailed structure
      console.log("Leaves Summary:", {
        count: leaves.length,
        paths: leaves.map(l => l.path),
        sample: leaves.length > 0 ? leaves.slice(0, Math.min(3, leaves.length)) : []
      });
      
      // Log leaf values by type
      const valuesByType = {};
      leaves.forEach(leaf => {
        const type = leaf.comp?.component?.type || leaf.comp?.type || 'unknown';
        if (!valuesByType[type]) valuesByType[type] = [];
        valuesByType[type].push({
          path: leaf.path,
          label: leaf.label,
          value: typeof leaf.value === 'object' ? 
            (Array.isArray(leaf.value) ? `Array[${leaf.value.length}]` : 'Object') : 
            leaf.value
        });
      });
      console.log("Leaf Values By Type:", valuesByType);
      
      // Log datatable and datagrid components specifically
      const gridComponents = Object.entries(metaByPath)
        .filter(([path, meta]) => meta.kind === 'datagrid' || meta.kind === 'datatable')
        .reduce((acc, [path, meta]) => {
          acc[path] = {
            ...meta,
            columnCount: (meta.columnKeys || []).length,
            labelSample: meta.columnLabels?.slice(0, 3) || []
          };
          return acc;
        }, {});
      
      console.log("DataGrid/DataTable components:", gridComponents);
      
      console.time("renderLeaves");
      const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath);
      console.timeEnd("renderLeaves");
      
      console.log("========== REVIEW HTML GENERATED ==========");

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

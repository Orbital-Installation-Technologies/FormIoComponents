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
      return false;
    }
  }

  async validateFormHard() {
    try {
      if (this.root?.everyComponent) {
        this.root.everyComponent((c) => {
          try {
            if (typeof c.setPristine === 'function') c.setPristine(false);
            if (typeof c.setDirty === 'function') c.setDirty(true);
          } catch { }
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
                  if (child?.setDirty) child.setDirty(true);
                });
              });
            }
          } catch { }
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
          } catch { }
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
          } catch { }
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
          } catch { }
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
            } catch (e) { }
          }
        });
      } catch (e) { }



      // Collect reviewVisible leaves and container labels
      async function collectReviewLeavesAndLabels(root) {
        const pushedPaths = new Set();
        // Canonicalize paths to avoid duplicates from e.g. form.data., submission., etc.
        const canon = (p = '') => {
          // More aggressive canonicalization to ensure uniqueness
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
        const leaves = [];
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
          f.everyComponent((c) => {
            const shouldSkip = c.parent && (
              c.parent.component?.type === 'datatable' ||
              c.parent.component?.type === 'datagrid'
            );
            if (shouldSkip) {
              return;
            }
            if (prefix) c.__prefix = prefix;
            queue.push(c);
          });
        };

        const safePath = (c) => (c?.__reviewPath) || (c?.__prefix ? `${c.__prefix}${c.path}` : c?.path);

        enqueueAll(root);

        let processedCount = 0;
        const logInterval = Math.max(10, Math.floor(queue.length / 10)); // Log every 10% of components

        while (queue.length) {
          const comp = queue.shift();
          if (!comp) continue;

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
            const isContainerType = (t) => ['panel', 'container', 'columns', 'well', 'fieldset', 'table', 'tabs'].includes(t);
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
                    comp,
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
            labelByPathMap.set(containerPath, comp.component?.label || comp.key || '');
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
            parentType === 'tagpad';

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
            comp?.type === 'content' ||
            comp?.type === 'htmlelement';

          // Extra check to ensure we don't get duplicate fields from datatables/datagrids
          const componentPath = safePath(comp);
          const pathParts = (componentPath || '').split('.');
          const hasArrayNotation = componentPath && componentPath.includes('[') && componentPath.includes(']');
          const isGridChild = hasArrayNotation || pathParts.some(part => /^\d+$/.test(part));

          // Check if this is a form component
          const isFormComponent = comp.type === 'form' || comp.component?.type === 'form';

          // Log form component info
          if (isFormComponent) {
            console.log('Form component in final processing:', {
              key: comp.key,
              path: comp.path,
              isVisible: comp.visible !== false,
              reviewVisible: comp.component?.reviewVisible === true,
              hasValue: comp.hasValue ? true : false,
              value: comp.hasValue ? ('getValue' in comp ? 'Has getValue' : 'No getValue') : 'No value'
            });
          }

          // Only push generic leaves if parent is NOT a handled container and not part of grid data
          if (
            !parentIsHandled &&
            !isContentComponent &&
            !isGridChild &&
            comp.visible !== false &&
            (comp.component?.reviewVisible === true || isTagpadComponent || isFormComponent)
          ) {
            // For form components, we need to ensure we include them and their data
            const componentValue = isFormComponent
              ? (comp.data || comp.submission?.data || comp.dataValue || {})
              : (('getValue' in comp) ? comp.getValue() : comp.dataValue);

            pushLeaf({
              comp,
              path: comp.__reviewPath || safePath(comp) || comp.key,
              label: comp.component?.label || comp.key,
              value: componentValue,
              formIndex: topIndexFor(comp)
            });

            // Log what we're pushing for form components
            if (isFormComponent) {
              console.log('Pushing form component leaf:', {
                path: comp.__reviewPath || safePath(comp) || comp.key,
                label: comp.component?.label || comp.key,
                hasValue: componentValue !== undefined
              });
            }
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
          // Handle form component values differently
          if (comp?.type === 'form' || comp?.component?.type === 'form') {
            console.log('Formatting form value:', {
              value: typeof value === 'object' ? 'Object' : value,
              hasData: value && typeof value === 'object' && Object.keys(value).length > 0
            });

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

        // ---- build tree from leaf paths
        for (const { path, label, value, comp, formIndex } of sortedLeaves) {
          // Create a normalized version of the path for de-duplication
          const normalizedPath = path.replace(/\.data\./g, '.')
            .replace(/^data\./, '')
            .replace(/^form\./, '')
            .replace(/^submission\./, '');

          // Skip if we've already processed this path in the tree
          if (processedTreePaths.has(normalizedPath)) {
            console.log('Skipping duplicate path in tree building:', normalizedPath);
            continue;
          }
          processedTreePaths.add(normalizedPath);

          const parts = normalizedPath
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

          return sortedEntries.map(([k, v]) => {
            // ignore stray tokens
            if (/^\d+\]$/.test(k)) {
              return v && typeof v === 'object' ? renderNode(v.__children || {}, depth) : '';
            }

            if (v && v.__leaf) {
              // Check if this is a form component leaf
              const isFormComponent = v.__comp?.type === 'form' || v.__comp?.component?.type === 'form';

              // Log form components we're rendering
              if (isFormComponent) {
                console.log('Rendering form component leaf:', {
                  key: k,
                  label: v.__label,
                  path: v.__path,
                  value: typeof v.__value === 'object' ? 'Object value' : v.__value
                });
              }

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
              const displayLabel = v.__suppress ? '' : (v.__label || (k === 'form' ? '' : k));
              const header = displayLabel ? `<div style="${pad}"><strong>${displayLabel}:</strong>` : `<div style="${pad}">`;

              // ---- DataGrid/DataTable: render as Rows -> Columns -> fields
              if ((v.__kind === 'datagrid' || v.__kind === 'datatable') && hasRows) {
                // which columns are present across rows?
                const presentKeys = new Set();
                Object.values(v.__rows).forEach(r => {
                  Object.keys(r.__children || {}).forEach(cKey => presentKeys.add(cKey));
                });

                // Debug check for duplicate rendering
                console.log('Row structure for rendering:', v.__rows);

                // keep schema order if we have it
                const orderedKeys = Array.isArray(v.__colKeys) && v.__colKeys.length
                  ? v.__colKeys.filter(cKey => presentKeys.has(cKey))
                  : Array.from(presentKeys);

                console.log('Ordered keys for rendering:', orderedKeys);

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
                    console.log('Row children:', Object.keys(row.__children || {}));

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
        console.log("Final review structure tree:", JSON.parse(JSON.stringify(root, (key, value) => {
          // Filter out certain properties to make the log more readable
          if (key === '__comp') return undefined;
          if (typeof value === 'function') return '[Function]';
          return value;
        })));

        return renderNode(root, 0);
      }


      const { leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath } =
        await collectReviewLeavesAndLabels(this.root);

      const reviewHtml = renderLeaves(leaves, labelByPath, suppressLabelForKey, metaByPath, indexByPath);

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

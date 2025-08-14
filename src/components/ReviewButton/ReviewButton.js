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



      // Collect reviewVisible leaves and container labels
      async function collectReviewLeavesAndLabels(root) {
        if (root.ready) await root.ready;
        const leaves = [];
        const labelByPath = new Map();
        const suppressLabelForKey = new Set(['dataGrid']);
        const queue = [];
        const enqueueAll = (f) => f.everyComponent && f.everyComponent((c) => queue.push(c));
        enqueueAll(root);
        while (queue.length) {
          const comp = queue.shift();
          if (!comp) continue;
          if (comp.type === 'form') {
            if (comp.subFormReady) await comp.subFormReady;
            if (comp.subForm) enqueueAll(comp.subForm);
            const title = comp.formObj?.title || comp.component?.label || comp.key || 'Form';
            labelByPath.set(comp.path, title);
            continue;
          }
          if (comp.component?.type === 'datagrid' && comp.rows) {
            labelByPath.set(comp.path, comp.component?.label || comp.key || 'List');
            comp.rows.forEach((row, rIdx) => {
              Object.values(row).forEach(child => {
                if (child) {
                  child.__reviewPath = `${comp.path}[${rIdx}].${child.path?.slice(comp.path.length + 1) || child.key}`;
                  queue.push(child);
                }
              });
            });
            continue;
          }
          if (comp.component?.type === 'editgrid' && comp.editRows?.length) {
            labelByPath.set(comp.path, comp.component?.label || comp.key || 'Items');
            comp.editRows.forEach((r, rIdx) => (r.components || []).forEach(ch => {
              ch.__reviewPath = `${comp.path}[${rIdx}].${ch.path?.slice(comp.path.length + 1) || ch.key}`;
              queue.push(ch);
            }));
            continue;
          }
          if (Array.isArray(comp.components) && comp.components.length) {
            labelByPath.set(comp.path, comp.component?.label || comp.key || '');
            comp.components.forEach(ch => queue.push(ch));
            continue;
          }
          if (comp.component?.reviewVisible === true && comp.visible !== false) {
            leaves.push({
              comp,
              path: comp.__reviewPath || comp.path || comp.key,
              label: comp.component?.label || comp.key,
              value: ('getValue' in comp) ? comp.getValue() : comp.dataValue
            });
          }
        }
        return { leaves, labelByPath, suppressLabelForKey };
      }

      // Build readable HTML tree using labels
      function renderLeaves(leaves, labelByPath, suppressLabelForKey) {
        const root = {};
        const ensureNode = (obj, k) => (obj[k] ??= { __children: {}, __rows: {}, __label: null, __suppress: false });

        function setNodeLabelForPath(node, containerPath) {
          if (!node.__label && labelByPath.has(containerPath)) node.__label = labelByPath.get(containerPath);
        }

        // helper: make values pretty, especially files/images
        function formatValue(value, comp) {
          const isFileish =
            comp?.component?.type === 'file' ||
            comp?.component?.type === 'image' ||
            comp?.component?.storage ||               // file component usually has storage set
            comp?.component?.filePattern;             // sometimes present

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
          const parts = path.replace(/\.data\./g, '.').split('.');
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
                      Object.entries(v.__rows).map(([i, r]) =>
                        `<li>Item ${Number(i)+1}:${renderNode(r.__children, depth + 1)}</li>`
                      ).join('')
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
        // Dynamically check for required modal fields and notify if missing
        const requiredFields = [
          { id: "verified", type: "select", label: "Verified" },
          { id: "notesRequired", type: "textarea", label: "Explain why not verified" },
          { id: "notesOptional", type: "textarea", label: "Notes (optional)" },
          { id: "supportNumber", type: "input", label: "Support Number" },
        ];
        for (const field of requiredFields) {
          if (!modal.querySelector(`#${field.id}`)) {
            alert(`Review page can't find reference to field '${field.label}'. Please add a ${field.type} element with id '${field.id}'.`);
            return;
          }
        }

        const verifiedSelectValue = modal.querySelector("#verified").value;
        const notesRequired = modal.querySelector("#notesRequired").value;
        const notesOptional = modal.querySelector("#notesOptional").value;
        const supportNumber = modal.querySelector("#supportNumber").value;
        const screenshotComp = this.root.getComponent("screenshot");
        let uploadedFiles = [];
        if (screenshotComp) {
          uploadedFiles = screenshotComp.getValue() || [];
        } else if (verifiedSelectValue === "App" || verifiedSelectValue === "Support") {
          alert("Review page can't find reference to file upload screenshotComp. Please add a File Upload component with key 'screenshot'.");
          return;
        }

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

        // Dynamically check for required form components and notify if missing (show all missing at once)
        const requiredComponents = [
          { key: "reviewed", type: "hidden/text", label: "Reviewed" },
          { key: "supportNumber", type: "text", label: "Support Number" },
          { key: "verifiedSelect", type: "select", label: "Verified" },
          { key: "notesOptional", type: "textarea", label: "Notes (optional)" },
          { key: "notesRequired", type: "textarea", label: "Explain why not verified" },
        ];
        const missingComponents = requiredComponents.filter(comp => !this.root.getComponent(comp.key));
        if (missingComponents.length > 0) {
          const list = missingComponents.map(comp => `- '${comp.label}': Please add a ${comp.type} component with key '${comp.key}'.`).join('\n');
          alert(`Review page can't find reference to the following form components:\n${list}`);
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

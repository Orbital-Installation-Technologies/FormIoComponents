setTimeout(() => {
  console.log("Patching Form.io components for reviewVisible and DataGrid row labels...");

  const Components = window.Formio?.Components;
  if (!Components) {
    console.warn("Formio.Components not found.");
    return;
  }

  // 1. Inject "reviewVisible" checkbox into all components' editForm
  Object.entries(Components.components).forEach(([name, Component]) => {
    if (typeof Component?.editForm === "function") {
      const originalEditForm = Component.editForm;

      Component.editForm = (...args) => {
        const form = originalEditForm(...args);
        const top = Array.isArray(form) ? form[0] : form;
        const tabs = top?.components || [];

        const tabDef = tabs.find((t) => t.key === "tabs");
        const display = tabDef?.components.find((t) => t.key === "display")?.components;

        if (Array.isArray(display) && !display.some((c) => c.key === "reviewVisible")) {
          display.push({
            type: "checkbox",
            key: "reviewVisible",
            label: "Show in Review Modal",
            input: true,
            weight: 999,
            tooltip: "If checked, this field will appear in the Review modal summary.",
          });
        }

        return form;
      };

      Component._patchedForReview = true;
    }

    // 2. Patch updateValue to avoid re-renders (e.g. auto-scroll)
    const proto = Component.prototype;
    if (!proto || proto._patchedUpdateValue) return;

    const originalUpdateValue = proto.updateValue;
    proto.updateValue = function (value, flags = {}) {
      flags = { noUpdateEvent: true, fromUser: true, ...flags };
      return originalUpdateValue.call(this, value, flags);
    };

    proto._patchedUpdateValue = true;
  });

  // 3. Extend DataGrid to set labels dynamically from hardwareProduct
  const DataGrid = Components.components.datagrid;
  if (DataGrid && !DataGrid._patchedRowLabeling) {
    const PatchedDataGrid = class extends DataGrid {
      setValue(value, flags) {
        const result = super.setValue(value, flags);

        // Rename each row label inside the datagrid dynamically
        this.rows?.forEach((row, index) => {
          console.log(row);

          const formComponent = row?.components?.find((c) => c.component.type === "form");
          console.log("formComponent: ", formComponent);

          if (!formComponent) return;

          const label = formComponent.getValue()?.form?.data?.hardwareProduct;
          console.log("label: ", label);

          formComponent.component.label = label ? `Hardware: ${label}` : `Hardware ${index + 1}`;
        });

        return result;
      }
    };

    Components.addComponent("datagrid", PatchedDataGrid);
    DataGrid._patchedRowLabeling = true;
    console.log("DataGrid patch applied for dynamic row labeling.");
  }

  console.log("ReviewVisible and DataGrid patches completed.");
}, 1000);

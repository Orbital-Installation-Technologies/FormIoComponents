setTimeout(() => {
  console.log("Patching Form.io components for reviewVisible...");

  const Components = window.Formio?.Components;

  if (!Components) {
    console.warn("Formio.Components not found.");
    return;
  }

  Object.entries(Components.components).forEach(([name, Component]) => {
    console.log(Component);

    if (typeof Component?.editForm === "function") {
      const originalEditForm = Component.editForm;
      console.log(originalEditForm);

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
  });

  console.log("✅ ReviewVisible checkbox injected.");
}, 1000); // Delay to let builder load first

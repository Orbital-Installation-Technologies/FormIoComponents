setTimeout(() => {
  console.log("Patching Form.io components for reviewVisible...");

  const Components = window.Formio?.Components;

  if (!Components) {
    console.warn("Formio.Components not found.");
    return;
  }

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

    // Patch updateValue to avoid full re-render that causes scroll reset
    const proto = Component.prototype;
    // if (!proto || proto._patchedUpdateValue) return;

    const originalUpdateValue = proto.updateValue;
    console.log("originalUpdateValue", originalUpdateValue);

    proto.updateValue = function (value, flags = {}) {
      flags = { noUpdateEvent: true, fromUser: true, ...flags };
      return originalUpdateValue.call(this, value, flags);
    };

    proto._patchedUpdateValue = true;
  });

  console.log("ReviewVisible checkbox injected.");
}, 1000); // Delay to let builder load first

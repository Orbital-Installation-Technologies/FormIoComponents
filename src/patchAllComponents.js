import { Components } from "@formio/js";

Object.entries(Components.components).forEach(([name, Component]) => {
  if (Component && typeof Component.editForm === "function") {
    const originalEditForm = Component.editForm;

    Component.editForm = (...extend) => {
      const form = originalEditForm(...extend);

      // Handle nested structure
      const topLevel = Array.isArray(form) ? form[0] : form;
      const tabs = topLevel?.components || [];

      const tabComponents = tabs.find((t) => t.key === "tabs") || [];

      const displayTab = tabComponents.components.find((c) => c.key === "display");

      if (displayTab && Array.isArray(displayTab.components)) {
        const alreadyAdded = displayTab.components.some((c) => c.key === "reviewVisible");

        if (!alreadyAdded) {
          displayTab.components.push({
            type: "checkbox",
            key: "reviewVisible",
            label: "Show in Review Modal",
            input: true,
            weight: 999,
            tooltip: "If checked, this field will appear in the Review modal summary.",
          });
        }
      }

      return form;
    };
  }
});

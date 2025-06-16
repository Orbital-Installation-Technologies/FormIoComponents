import { Components } from "@formio/js";
console.log("patch running");

Object.values(Components.components).forEach((Component) => {
  if (Component && typeof Component.editForm === "function") {
    const originalEditForm = Component.editForm;

    Component.editForm = (...extend) => {
      const form = originalEditForm(...extend);

      const displayTab = form.find((section) => section.key === "display");
      if (displayTab && !displayTab.components.some((c) => c.key === "reviewVisible")) {
        displayTab.components.push({
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
  }
});

// register plugin BEFORE creating builder
Formio.use(ReviewFieldPlugin);

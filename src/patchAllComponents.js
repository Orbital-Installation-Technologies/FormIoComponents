import { Formio, Components } from "@formio/js";
console.log("Patching all components to add reviewVisible field...");

const ReviewFieldPlugin = {
  init: () => {
    console.log("ReviewFieldPlugin initialized. Patching components...");

    Object.entries(Components.components).forEach(([name, Component]) => {
      console.log(typeof Component?.editForm);

      if (typeof Component?.editForm === "function") {
        const original = Component.editForm;
        Component.editForm = (...args) => {
          const form = original(...args);
          console.log("form:", form);

          const top = Array.isArray(form) ? form[0] : form;
          console.log("top:", top);

          const tabs = top?.components || [];
          const tabDef = tabs.find((t) => t.key === "tabs");
          const display = tabDef?.components.find((t) => t.key === "display")?.components;
          console.log("display:", display);

          if (Array.isArray(display) && !display.some((c) => c.key === "reviewVisible")) {
            display.push({
              type: "checkbox",
              key: "reviewVisible",
              label: "Show in Review Modal",
              input: true,
              weight: 999,
              tooltip: "If checked, this field will appear in the Review modal summary.",
            });
            console.log("display2:", display);
          }
          console.log("form2:", form);

          return form;
        };
      }
    });
  },
};

// register plugin BEFORE creating builder
Formio.registerPlugin(ReviewFieldPlugin, "ReviewFieldPlugin");

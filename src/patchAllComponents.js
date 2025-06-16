import { Formio, Components } from '@formio/js';

const ReviewFieldPlugin = {
  init: () => {
    Object.entries(Components.components).forEach(([name, Component]) => {
      if (Component?.editForm instanceof Function) {
        const original = Component.editForm;
        Component.editForm = (...args) => {
          const form = original(...args);
          const top = Array.isArray(form) ? form[0] : form;
          const tabs = top?.components || [];
          const tabDef = tabs.find(t => t.key === 'tabs');
          const display = tabDef?.components
            .find(t => t.key === 'display')
            ?.components;
          if (Array.isArray(display) && !display.some(c => c.key === 'reviewVisible')) {
            display.push({
              type: 'checkbox',
              key: 'reviewVisible',
              label: 'Show in Review Modal',
              input: true,
              weight: 999,
              tooltip: 'If checked, this field will appear in the Review modal summary.',
            });
          }
          return form;
        };
      }
    });
  }
};

// register plugin BEFORE creating builder
Formio.registerPlugin(ReviewFieldPlugin, 'ReviewFieldPlugin');
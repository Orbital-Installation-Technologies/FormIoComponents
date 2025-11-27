export default [
  {
    type: "panel",
    title: "Scandit Configuration",
    key: "scandit-config",
    weight: 500,
    components: [
      {
        type: "textarea",
        key: "scanditLicenseKey",
        label: "Scandit License Key (Optional)",
        placeholder: "Paste your Scandit Web Datacapture license key here (or use environment variable)",
        tooltip: "Your Scandit license key for barcode scanning. Can be obtained from your Scandit account.",
        input: true,
        rows: 4,
        editor: "ace",
        as: "text",
        validate: {
          required: false
        }
      },
      {
        type: "select",
        key: "backupBarcodeField",
        label: "Backup Barcode Field",
        tooltip: "Optional field to store all detected barcodes as backup (comma-separated).",
        input: true,
        clearable: true,
        dataSrc: "custom",
        valueProperty: "key",
        template: "<span>{{ item.label }} ({{ item.key }})</span>",
        customDefaultValue: null,
        data: {
          custom: `
            const textFields = [];
            if (instance.root && instance.root.form && instance.root.form.components) {
              const findTextFields = (components, path = '') => {
                components.forEach(comp => {
                  if (['textfield', 'textarea', 'email', 'url', 'number', 'password'].includes(comp.type)) {
                    textFields.push({
                      key: comp.key,
                      label: comp.label || comp.key,
                      value: comp.key
                    });
                  }
                  if (comp.components && Array.isArray(comp.components)) {
                    findTextFields(comp.components, path);
                  }
                });
              };
              findTextFields(instance.root.form.components);
            }
            value = textFields;
          `
        }
      },
      {
        type: "select",
        key: "imageUploadField",
        label: "File Upload Component",
        tooltip: "Optional file upload component to save the barcode image. Leave empty to disable image capture.",
        input: true,
        clearable: true,
        dataSrc: "custom",
        valueProperty: "key",
        template: "<span>{{ item.label }} ({{ item.key }})</span>",
        customDefaultValue: null,
        data: {
          custom: `
            const fileComponents = [];
            if (instance.root && instance.root.form && instance.root.form.components) {
              const findFileComponents = (components, path = '') => {
                components.forEach(comp => {
                  if (comp.type === 'file') {
                    fileComponents.push({
                      key: comp.key,
                      label: comp.label || comp.key,
                      value: comp.key
                    });
                  }
                  if (comp.components && Array.isArray(comp.components)) {
                    findFileComponents(comp.components, path);
                  }
                });
              };
              findFileComponents(instance.root.form.components);
            }
            value = fileComponents;
          `
        }
      }
    ]
  },

  {
    type: "checkbox",
    key: "reviewVisible",
    label: "Show in Review Modal",
    input: true,
    weight: 999,
    tooltip: "If checked, this field will appear in the Review modal summary.",
  },


  {
    type: 'panel',
    title: 'Simple Conditional',
    key: 'simple-conditional',
    weight: 1000,
    theme: 'default',
    components: [
      {
        type: 'select',
        input: true,
        label: 'When',
        key: 'conditional.show',
        dataSrc: 'values',
        data: {
          values: [
            { label: 'Always', value: 'always' },
            { label: 'When the form value', value: 'json' }
          ]
        }
      },
      {
        type: 'textfield',
        input: true,
        label: 'Equals',
        key: 'conditional.eq',
        conditional: {
          json: { '===': [{ var: 'data.conditional.show' }, 'json'] }
        }
      },
      {
        type: 'textfield',
        input: true,
        label: 'JSON Logic',
        key: 'conditional.json',
        placeholder: '{ ... }',
        tooltip: 'Enter JSON Logic.',
        conditional: {
          json: { '===': [{ var: 'data.conditional.show' }, 'json'] }
        }
      }
    ]
  },

  {
    type: 'panel',
    title: 'Advanced Conditional',
    theme: 'default',
    collapsible: true,
    collapsed: true,
    key: 'advanced-conditional',
    weight: 1010,
    components: [
      {
        type: 'textarea',
        key: 'customConditional',
        rows: 5,
        editor: 'ace',
        hideLabel: true,
        input: true,
        placeholder: 'Example: show = data.myfield === "myvalue";',
        description: '<p>Enter custom conditional code.</p><p>You must assign the <strong>show</strong> variable as either <strong>true</strong> or <strong>false</strong>.</p><p><strong>Note: Advanced Conditional logic will override the results of the Simple Conditional logic.</strong></p>'
      }
    ]
  }
];

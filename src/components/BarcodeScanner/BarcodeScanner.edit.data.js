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
        valueProperty: "value",
        template: "<span>{{ item.label }} ({{ item.value }})</span>",
        data: {
          custom: function(context) {
            const values = [];
            const textFieldTypes = ['textfield', 'textarea', 'email', 'url', 'number', 'password'];

            try {
              const components = context?.buildingForm?.components || [];

              console.log('[Backup Field] Components found.............:', components.length, components);

              const findTextFields = (comps) => {
                if (!Array.isArray(comps)) return;
                comps.forEach(comp => {
                  if (comp && comp.type && textFieldTypes.includes(comp.type) && comp.key) {
                    console.log('[Backup Field] Matched:', comp.key, comp.type);
                    values.push({
                      label: comp.label || comp.key,
                      value: comp.key
                    });
                  }
                  if (comp.components && Array.isArray(comp.components)) {
                    findTextFields(comp.components);
                  }
                });
              };

              findTextFields(components);
              console.log('[Backup Field] Final values:', values);
            } catch (e) {
              console.error('[Backup Field] Error:', e);
            }

            return values;
          }
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
        valueProperty: "value",
        template: "<span>{{ item.label }} ({{ item.value }})</span>",
        data: {
          custom: function(context) {
            const values = [];

            try {
              const components = context?.buildingForm?.components || [];

              console.log('[File Field] Components found:', components.length, components);

              const findFileComponents = (comps) => {
                if (!Array.isArray(comps)) return;
                comps.forEach(comp => {
                  if (comp && comp.type === 'file' && comp.key) {
                    console.log('[File Field] Matched:', comp.key, comp.type);
                    values.push({
                      label: comp.label || comp.key,
                      value: comp.key
                    });
                  }
                  if (comp.components && Array.isArray(comp.components)) {
                    findFileComponents(comp.components);
                  }
                });
              };

              findFileComponents(components);
              console.log('[File Field] Final values:', values);
            } catch (e) {
              console.error('[File Field] Error:', e);
            }

            return values;
          }
        }
      }
    ]
  }
];

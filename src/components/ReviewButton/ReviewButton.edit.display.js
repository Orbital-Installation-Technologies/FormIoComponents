export default [
  {
    type: "checkbox",
    key: "reviewVisible",
    label: "Show in Review Modal",
    input: true,
    weight: 999,
    tooltip: "If checked, this field will appear in the Review modal summary.",
  },
  {
    type: "checkbox",
    key: "requireSupportFields",
    label: "Require Support Fields",
    input: true,
    weight: 1000,
    defaultValue: true,
    tooltip: "If checked, the support number, verified, screenshot, and notes fields will be shown and required in the review modal. If unchecked, these fields will be hidden and validation will be skipped.",
  },
  {
    type: "textarea",
    key: "supportFieldsVisibilityLogic",
    label: "Support Fields Custom Visibility Logic",
    input: true,
    weight: 1001,
    rows: 3,
    editor: "ace",
    as: "javascript",
    conditional: {
      json: {
        "==": [
          { var: "data.requireSupportFields" },
          false
        ]
      }
    },
    tooltip: "Custom JavaScript to determine if support fields should be shown. Return true to show fields, false to hide. Access form data with 'data'. Example: data.needsSupport === true",
    placeholder: "// Example:\n// return data.needsSupport === true;",
  },
  {
    type: "select",
    key: "afterSubmitAction",
    label: "After Submit Action",
    input: true,
    weight: 1002,
    defaultValue: "reload",
    data: {
      values: [
        { label: "Reload Page", value: "reload" },
        { label: "Redirect to URL", value: "redirect" },
        { label: "Replace Form with Custom HTML", value: "customHtml" }
      ]
    },
    tooltip: "Choose what happens after successful form submission. Reload will refresh the page, Redirect will navigate to a URL, and Custom HTML will replace the form with your own HTML content.",
  },
  {
    type: "textfield",
    key: "redirectUrl",
    label: "Redirect URL",
    input: true,
    weight: 1003,
    placeholder: "https://example.com/success",
    conditional: {
      json: {
        "==": [
          { var: "data.afterSubmitAction" },
          "redirect"
        ]
      }
    },
    tooltip: "The URL to redirect to after successful form submission. Must start with http:// or https://",
    validate: {
      custom: "valid = !input || input === '' || /^https?:\\/\\/.+/.test(input) ? true : 'URL must start with http:// or https://';"
    }
  },
  {
    type: "textarea",
    key: "customSuccessHtml",
    label: "Custom Success HTML",
    input: true,
    weight: 1004,
    rows: 10,
    editor: "ace",
    as: "html",
    conditional: {
      json: {
        "==": [
          { var: "data.afterSubmitAction" },
          "customHtml"
        ]
      }
    },
    tooltip: "Custom HTML to display after successful form submission. This will replace the entire form. You can use data.fieldName to access submitted values in JavaScript.",
    placeholder: `<!-- Example: -->\n<div style="text-align: center; padding: 40px;">\n  <h1 style="color: green;">✓ Success!</h1>\n  <p>Your form has been submitted successfully.</p>\n  <p>Reference: <strong id="refNumber"></strong></p>\n</div>\n<script>\n  // Access form data if needed\n  // document.getElementById('refNumber').textContent = 'REF-' + Date.now();\n</script>`,
  },
];

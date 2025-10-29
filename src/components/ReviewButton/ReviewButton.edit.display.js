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
];

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

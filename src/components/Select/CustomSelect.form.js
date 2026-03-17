import { Components } from "@formio/js";
export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: 'display',
        components: [
          {
            type: 'checkbox',
            key: 'wrapOptionText',
            label: 'Wrap long option text',
            tooltip: 'When enabled, option text that exceeds the width of the dropdown will wrap onto additional lines instead of being truncated.',
            input: true,
            defaultValue: true,
            weight: 700,
          }
        ]
      }
    ],
    ...extend,
  );
}

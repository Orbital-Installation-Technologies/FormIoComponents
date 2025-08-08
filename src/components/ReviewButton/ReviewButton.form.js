import { Components } from "@formio/js";
import ReviewButtonEditDisplay from "./ReviewButton.edit.display.js";
export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "display",
        components: ReviewButtonEditDisplay,
      },
      {
          key: 'layout',
          ignore: true
      }
    ],
    ...extend,
  );
}

import { Components } from "@formio/js";
import ReviewButtonEditDisplay from "./ReviewButton.edit.display.js";
export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "data",
        ignore: true,
      },
      {
        key: "display",
        components: ReviewButtonEditDisplay,
      },
      {
        key: "validation",
        ignore: false,
      },
    ],
    ...extend,
  );
}

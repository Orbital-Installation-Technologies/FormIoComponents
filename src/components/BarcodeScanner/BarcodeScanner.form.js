import { Components } from "@formio/js";
import BarcodeEditDisplay from "./BarcodeScanner.edit.display.js";

export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "display",
        components: BarcodeEditDisplay,
      },
      {
          key: 'layout',
          ignore: true
      }
    ],
    ...extend,
  );
}

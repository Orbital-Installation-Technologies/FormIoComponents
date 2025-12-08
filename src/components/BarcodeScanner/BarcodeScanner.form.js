import { Components } from "@formio/js";
import BarcodeEditDisplay from "./BarcodeScanner.edit.display.js";
import BarcodeEditData from "./BarcodeScanner.edit.data.js";
import BarcodeEditConditional from "./BarcodeScanner.edit.conditional.js";

export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "display",
        components: BarcodeEditDisplay,
      },
      {
        key: "data",
        components: BarcodeEditData,
      },
      {
        key: "conditional",
        components: BarcodeEditConditional,
      },
      {
          key: 'layout',
          ignore: true
      }
    ],
    ...extend,
  );
}

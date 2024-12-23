import { Formio } from "formiojs";
import BarcodeEditDisplay from "./BarcodeScanner.edit.display.js";
export default function (...extend) {
  return Formio.Components.baseEditForm(
    [
      {
        key: "data",
        ignore: true,
      },
      {
        key: "display",
        components: BarcodeEditDisplay,
      },
      {
        key: "validation",
        ignore: false,
      },
    ],
    ...extend,
  );
}

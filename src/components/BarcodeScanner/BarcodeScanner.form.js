import { Components } from "@formio/js";
import BarcodeEditDisplay from "./BarcodeScanner.edit.display.js";

export default function (...extend) {
  return Components.baseEditForm(
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
        key: 'conditional',
        ignore: false,
      },
      {
        key: "validation",
        ignore: false,
      },
    ],
    ...extend,
  );
}

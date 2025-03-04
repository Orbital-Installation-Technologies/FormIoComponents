import { Components } from "@formio/js";
import GpsEditDisplay from "./Gps.edit.display.js";
export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "data",
        ignore: true,
      },
      {
        key: "display",
        components: GpsEditDisplay,
      },
      {
        key: "validation",
        ignore: false,
      },
    ],
    ...extend,
  );
}

import { Formio } from "formiojs";
import GpsEditDisplay from "./Gps.edit.display.js";
export default function (...extend) {
  return Formio.Components.baseEditForm(
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
        ignore: true,
      },
    ],
    ...extend,
  );
}

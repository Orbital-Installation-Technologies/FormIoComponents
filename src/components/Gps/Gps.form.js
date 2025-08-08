import { Components } from "@formio/js";
import GpsEditDisplay from "./Gps.edit.display.js";
export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "display",
        components: GpsEditDisplay,
      },
      {
          key: 'layout',
          ignore: true
      }
    ],
    ...extend,
  );
}

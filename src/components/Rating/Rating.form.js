import { Components } from "@formio/js";
import RatingEditDisplay from "./Rating.edit.display.js";
export default function (...extend) {
  return Components.baseEditForm(
    [
      {
        key: "data",
        ignore: true,
      },
      {
        key: "display",
        components: RatingEditDisplay,
      },
      {
        key: "validation",
        ignore: true,
      },
    ],
    ...extend,
  );
}

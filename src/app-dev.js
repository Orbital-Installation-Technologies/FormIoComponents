import { Formio } from "formiojs";
import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner.js";

Formio.use([
  {
    components: {
      rating: Rating,
      barcode: BarcodeScanner,
    },
  },
]);

Formio.builder(
  document.getElementById("builder"),
  {},
  {
    sanitizeConfig: {
      addTags: ["svg", "path"],
      addAttr: ["d", "viewBox"],
    },
  },
).then(() => {});

Formio.createForm(
  document.getElementById("formio"),
  {
    components: [Rating.schema(), BarcodeScanner.schema()],
  },
  {
    sanitizeConfig: {
      addTags: ["svg", "path"],
      addAttr: ["d", "viewBox"],
    },
  },
);

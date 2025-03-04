import { Formio } from "@formio/js";
import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner.js";
import Gps from "./components/Gps/Gps.js";

Formio.use([
  {
    components: {
      rating: Rating,
      barcode: BarcodeScanner,
      gps: Gps,
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
    components: [Gps.schema(), Rating.schema(), BarcodeScanner.schema()],
  },
  {
    sanitizeConfig: {
      addTags: ["svg", "path"],
      addAttr: ["d", "viewBox"],
    },
  },
);

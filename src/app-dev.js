import "./patchAllComponents.js";

import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner.js";
import Gps from "./components/Gps/Gps.js";
import ReviewButton from "./components/ReviewButton/ReviewButton.js";

Formio.use(premium);

Formio.use([
  {
    components: {
      rating: Rating,
      barcode: BarcodeScanner,
      gps: Gps,
      reviewbutton: ReviewButton,
    },
  },
]);

// Formio.builder(
//   document.getElementById("builder"),
//   {},
//   {
//     sanitizeConfig: {
//       addTags: ["svg", "path"],
//       addAttr: ["d", "viewBox"],
//     },
//   },
// ).then(() => {});

// Formio.createForm(
//   document.getElementById("formio"),
//   {
//     components: [Gps.schema(), Rating.schema(), BarcodeScanner.schema(), ReviewButton.schema()],
//   },
//   {
//     sanitizeConfig: {
//       addTags: ["svg", "path"],
//       addAttr: ["d", "viewBox"],
//     },
//   },
// );

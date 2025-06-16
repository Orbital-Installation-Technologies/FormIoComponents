import { ReviewFieldPlugin } from "./patchAllComponents.js";

// Register plugin BEFORE custom components
Formio.use(ReviewFieldPlugin);

import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner";
import Gps from "./components/Gps/Gps";
import ReviewButton from "./components/ReviewButton/ReviewButton.js";

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

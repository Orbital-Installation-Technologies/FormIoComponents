import "./patchAllComponents.js";
import { Formio } from '@formio/js';
import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner";
import Gps from "./components/Gps/Gps";
import ReviewButton from "./components/ReviewButton/ReviewButton.js";

Formio.license = process.env.FORMIO_PREMIUM_LICENSE;
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

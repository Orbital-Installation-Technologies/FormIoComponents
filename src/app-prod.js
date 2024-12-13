import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner";

Formio.use([
  {
    components: {
      rating: Rating,
      barcode: BarcodeScanner,
    },
  },
]);

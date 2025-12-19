import "./patchAllComponents.js";
import premium from '@formio/premium';

import Rating from "./components/Rating/Rating.js";
import BarcodeScanner from "./components/BarcodeScanner/BarcodeScanner.js";
import Gps from "./components/Gps/Gps.js";
import ReviewButton from "./components/ReviewButton/ReviewButton.js";
import CustomFile from "./components/File/CustomFile.js";
import CustomSelect from "./components/Select/CustomSelect.js";

// Set Formio license with fallback handling
const licenseKey = process.env.NEXT_PUBLIC_FORMIO_PREMIUM_LICENSE;
if (licenseKey && licenseKey.trim()) {
  try {
    Formio.license = licenseKey.trim();
  } catch (error) {
    console.error('[Formio License] Failed to set license:', error);
  }
} else {
  console.warn('[Formio License] NEXT_PUBLIC_FORMIO_PREMIUM_LICENSE environment variable is not set.');
  console.warn('[Formio License] Formio premium features may not work correctly.');
  console.warn('[Formio License] Please ensure the license is set in your .env file or AWS Secrets Manager.');
}

Formio.use(premium);

Formio.use([
  {
    components: {
      rating: Rating,
      barcode: BarcodeScanner,
      gps: Gps,
      reviewbutton: ReviewButton,
      select: CustomSelect
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
    components: [Gps.schema(), Rating.schema(), BarcodeScanner.schema(), ReviewButton.schema(),
      { ...CustomFile.schema(), type: "file", storage: "s3", image: true },
      { ...CustomSelect.schema(), type: "select", key: "select" }
    ],
  },
  {
    sanitizeConfig: {
      addTags: ["svg", "path"],
      addAttr: ["d", "viewBox"],
    },
  },
);

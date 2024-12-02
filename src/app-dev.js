import { Formio } from "formiojs";
import Rating from "./Rating/Rating.js";

Formio.use([
  {
    components: {
      rating: Rating,
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
    components: [Rating.schema()],
  },
  {
    sanitizeConfig: {
      addTags: ["svg", "path"],
      addAttr: ["d", "viewBox"],
    },
  },
);

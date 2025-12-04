import { Components } from "@formio/js";
export default function (...extend) {
  return Components.baseEditForm(

    ...extend,
  );
}

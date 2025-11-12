import { Components } from "@formio/js";
import RatingEditDisplay from "./Rating.edit.display.js";

export default function (...extend){
  return Components.baseEditForm([
      {
          key: 'display',
          components: RatingEditDisplay
      },
      {
          key: 'layout',
          ignore: true
      }
  ], ... extend)
}
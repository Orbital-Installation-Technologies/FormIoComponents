import { Components } from "@formio/js";
import RatingEditDisplay from "./Rating.edit.display.js";
const baseEditForm = Formio.Components.baseEditForm

export default function (...extend){
  return baseEditForm([
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
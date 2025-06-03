import { Components } from "@formio/js";
import ratingEditForm from "./Rating.form.js";

const FieldComponent = Components.components.field;

export default class Rating extends FieldComponent {
  static editForm = ratingEditForm;
  static schema(...extend) {
    return FieldComponent.schema({
      type: "rating",
      label: "rating",
      key: "rating",
      unfilledColor: "#ddd",
      filledColor: "yellow",
      numOfIcons: "5",
      iconHeight: "25px",
      iconWidth: "25px",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
              \t viewBox="0 0 47.94 47.94" xml:space="preserve">
              <path d="M26.285,2.486l5.407,10.956c0.376,0.762,1.103,1.29,1.944,1.412l12.091,1.757
              \tc2.118,0.308,2.963,2.91,1.431,4.403l-8.749,8.528c-0.608,0.593-0.886,1.448-0.742,2.285l2.065,12.042
              \tc0.362,2.109-1.852,3.717-3.746,2.722l-10.814-5.685c-0.752-0.395-1.651-0.395-2.403,0l-10.814,5.685
              \tc-1.894,0.996-4.108-0.613-3.746-2.722l2.065-12.042c0.144-0.837-0.134-1.692-0.742-2.285l-8.749-8.528
              \tc-1.532-1.494-0.687-4.096,1.431-4.403l12.091-1.757c0.841-0.122,1.568-0.65,1.944-1.412l5.407-10.956
              \tC22.602,0.567,25.338,0.567,26.285,2.486z"/>
          </svg>`,
    });
  }

  static get builderInfo() {
    return {
      title: "Rating",
      icon: "star",
      group: "basic",
      documentation: "/userguide/#textfield",
      weight: 0,
      schema: Rating.schema(),
    };
  }

  setIconProperties() {
    const domIcon = new DOMParser().parseFromString(this.component.icon, "text/xml");
    domIcon.firstChild.style.fill = this.component.unfilledColor;
    domIcon.firstChild.style.display = "inline-block";
    domIcon.firstChild.setAttribute("height", this.component.iconHeight);
    domIcon.firstChild.setAttribute("width", this.component.iconWidth);
    this.component.icon = new XMLSerializer().serializeToString(domIcon.documentElement);
  }

  constructor(component, options, data) {
    super(component, options, data);
  }

  init() {
    this.setIconProperties();
    super.init();
  }

  conditionallyHidden(data) {
    if (!this.component.customConditional) return false;

    try {
      return !this.evaluate(
        this.component.customConditional,
        {
          ...this.data,
          ...data,
        },
        this.data,
      );
    } catch (e) {
      console.warn("Conditional logic error:", e);
      return false;
    }
  }

  get inputInfo() {
    const info = super.inputInfo;
    return info;
  }

  render(content) {
    let component = `<div ref="rating">`;
    for (let i = 0; i < this.component.numOfIcons; i++) {
      component += this.component.icon;
    }
    component += `</div>`;
    return super.render(component);
  }

  attach(element) {
    this.loadRefs(element, {
      rating: "single",
    });
    function clearRating(ratings, color) {
      for (const rating of ratings) {
        rating.style.fill = color;
      }
    }

    if (!this.component.disabled) {
      let icons = this.refs.rating.children;
      for (let i = 0; i < icons.length; i++) {
        let svg = icons[i];
        svg.addEventListener("click", () => {
          clearRating(icons, this.component.unfilledColor);
          svg.style.fill = this.component.filledColor;
          let previousElement = svg.previousElementSibling;
          while (previousElement) {
            previousElement.style.fill = this.component.filledColor;
            previousElement = previousElement.previousElementSibling;
          }
          this.updateValue(`${i + 1}/${icons.length}`);
        });
      }
    }
    return super.attach(element);
  }

  detach() {
    return super.detach();
  }

  destroy() {
    return super.destroy();
  }

  normalizeValue(value, flags = {}) {
    return super.normalizeValue(value, flags);
  }

  getValue() {
    return super.getValue();
  }

  getValueAt(index) {
    return super.getValueAt(index);
  }

  setValue(value, flags = {}) {
    return super.setValue(value, flags);
  }

  setValueAt(index, value, flags = {}) {
    return super.setValueAt(index, value, flags);
  }

  updateValue(value, flags = {}) {
    return super.updateValue(...arguments);
  }
}

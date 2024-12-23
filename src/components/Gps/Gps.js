import { Formio } from "formiojs";
import GpsEditForm from "./Gps.form";

const Field = Formio.Components.components.field;

export default class Gps extends Field {
  static editForm = GpsEditForm;
  static schema(...extend) {
    return Field.schema({
      type: "gps",
      label: "GPS Coordinates",
      key: "",
    });
  }

  static get builderInfo() {
    return {
      title: "GPS Location",
      icon: "location-crosshairs",
      group: "basic",
      documentation: "/userguide/#textfield",
      weight: 0,
      schema: Gps.schema(),
    };
  }

  constructor(component, options, data) {
    super(component, options, data);
  }

  init() {
    super.init();
  }

  get inputInfo() {
    const info = super.inputInfo;
    return info;
  }

  render(content) {
    let component = `<div>`;
    component += `
      <input ref="gps" type="text" class="form-control" value="">
    `
    component += `</div>`;
    return super.render(component);
  }

  attach(element) {
    this.loadRefs(element, {
      gps: "single",
    });

    if (!this.component.disabled) {
      this.refs.gps.addEventListener("change", () => {
        this.updateValue(this.refs.gps.value);
      });
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

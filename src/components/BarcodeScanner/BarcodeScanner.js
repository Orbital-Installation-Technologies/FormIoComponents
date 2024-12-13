import { Formio } from "formiojs";
import BarcodeScannerEditForm from "./BarcodeScanner.form";

const Field = Formio.Components.components.field;

export default class BarcodeScanner extends Field {
  static editForm = BarcodeScannerEditForm;
  static schema(...extend) {
    return Field.schema({
      type: "barcode",
      label: "Barcode",
      key: "",
    });
  }

  static get builderInfo() {
    return {
      title: "Barcode Scanner",
      icon: "barcode",
      group: "basic",
      documentation: "/userguide/#textfield",
      weight: 0,
      schema: BarcodeScanner.schema(),
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
      <input ref="barcode" type="text" class="form-control" value="">
    `
    component += `</div>`;
    return super.render(component);
  }

  attach(element) {
    this.loadRefs(element, {
      barcode: "single",
    });

    if (!this.component.disabled) {
      this.refs.barcode.addEventListener("change", () => {
        this.updateValue(this.refs.barcode.value);
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

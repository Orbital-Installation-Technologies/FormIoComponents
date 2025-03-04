import { Components } from "@formio/js";
import GpsEditForm from "./Gps.form";

const FieldComponent = Components.components.field;

export default class Gps extends FieldComponent {
  static editForm = GpsEditForm;
  static schema(...extend) {
    return FieldComponent.schema({
      type: "gps",
      label: "GPS Location",
      key: "",
      defaultToCurrentLocation: false,
    });
  }

  static get builderInfo() {
    return {
      title: "GPS Location",
      icon: "map",
      group: "basic",
      documentation: "/userguide/#textfield",
      weight: 0,
      schema: Gps.schema(),
    };
  }

  constructor(component, options, data) {
    super(component, options, data);
    this.errorMessage = "";
    this.fetchedInitially = false;
  }

  init() {
    super.init();
  }

  get inputInfo() {
    const info = super.inputInfo;
    return info;
  }

  render(content) {
    let component = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">`;
    component += `
      <input 
        ref="latitude" 
        type="number" 
        class="form-control" 
        value=""
        placeholder="Latitude"
        style="flex-grow: 1;"
      >
      <input 
        ref="longitude" 
        type="number" 
        class="form-control" 
        value=""
        placeholder="Longitude"
        style="flex-grow: 1;"
      >
      <button 
        ref="gpsButton" 
        type="button" 
        class="btn btn-primary">
        <i class="fa fa-map bi bi-map"></i>
      </button>
    `;
    component += "</div>";
    if (this.errorMessage) {
      component += `
      <div class="formio-errors">
        <div class="form-text error">${this.errorMessage}</div>
      </div>`;
    }
    component += `</div>`;

    return super.render(component);
  }

  attach(element) {
    this.loadRefs(element, {
      latitude: "single",
      longitude: "single",
      gpsButton: "single",
    });

    if (!this.component.disabled) {
      this.refs.latitude.addEventListener("change", () => {
        this.updateValue(this.refs.latitude.value);
      });

      this.refs.longitude.addEventListener("change", () => {
        this.updateValue(this.refs.longitude.value);
      });

      this.refs.gpsButton.addEventListener("click", () => {
        this.getLocation();
      });

      if (this.component.defaultToCurrentLocation && !this.fetchedInitially) {
        this.getLocation();
      }
    }
    return super.attach(element);
  }

  getLocation() {
    if (!navigator.geolocation) {
      console.log("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.setError(null);
        this.updateState();
        this.refs.latitude.value = latitude;
        this.updateValue(latitude);
        this.refs.longitude.value = longitude;
        this.updateValue(longitude);
        this.fetchedInitially = true;
      },
      (error) => {
        console.error("Geolocation error:", error);
        this.fetchedInitially = true;
        this.setError("Unable to retrieve location.");
        this.updateState();
      },
    );
  }

  updateState() {
    this.triggerChange();
    this.redraw();
  }

  setError(message) {
    if (message) {
      this.errorMessage = message;
      setTimeout(() => {
        this.errorMessage = "";
        this.updateState();
      }, 3000);
    } else {
      this.errorMessage = "";
    }
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

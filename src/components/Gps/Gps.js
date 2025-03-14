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
    return super.inputInfo;
  }

  render(content) {
    const value = this.getValue();
    const [latitude, longitude] = value ? value.split(",") : ["", ""];

    let component = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">`;
    component += `
      <input 
        ref="latitude" 
        type="number" 
        class="form-control" 
        value="${latitude}"
        placeholder="Latitude"
        style="flex-grow: 1;"
      >
      <input 
        ref="longitude" 
        type="number" 
        class="form-control" 
        value="${longitude}"
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
        const latitude = this.refs.latitude.value;
        const longitude = this.refs.longitude.value;
        this.updateValue(`${latitude},${longitude}`);
      });

      this.refs.longitude.addEventListener("change", () => {
        const latitude = this.refs.latitude.value;
        const longitude = this.refs.longitude.value;
        this.updateValue(`${latitude},${longitude}`);
      });

      this.refs.gpsButton.addEventListener("click", () => {
        this.getLocation();
      });

      setTimeout(() => {
        if (this.component.defaultToCurrentLocation && !this.fetchedInitially && !this.getValue()) {
          this.getLocation();
        }
      }, 1500);
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
        if (this.errorMessage !== "") {
          this.setError(null);
          this.updateState();
        }
        if (this.refs.latitude) {
          this.refs.latitude.value = latitude;
        }
        if (this.refs.longitude) {
          this.refs.longitude.value = longitude;
        }
        this.updateValue(`${latitude},${longitude}`);
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
    if (typeof value === "string" && value.includes(",")) {
      return value;
    }
    return "";
  }

  getValue() {
    const value = super.getValue();
    return this.normalizeValue(value);
  }

  setValue(value, flags = {}) {
    const normalizedValue = this.normalizeValue(value);
    if (this.dataValue !== normalizedValue) {
      super.setValue(normalizedValue, flags);
      this.triggerChange();
    }
    this.redraw();
  }

  updateValue(value, flags = {}) {
    const normalizedValue = this.normalizeValue(value);
    if (this.dataValue !== normalizedValue) {
      super.updateValue(normalizedValue, flags);
      this.triggerChange();
    }
  }
}

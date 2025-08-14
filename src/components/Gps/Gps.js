import { Components } from "@formio/js";
import GpsEditForm from "./Gps.form";

const FieldComponent = Components.components.field;

export default class Gps extends FieldComponent {
  static editForm = GpsEditForm;
  static schema(...extend) {
    return FieldComponent.schema(
      {
        type: "gps",
        label: "GPS Location",
        key: "",
      },
      ...extend,
    );
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
        readOnly
      >
      <input 
        ref="longitude" 
        type="number" 
        class="form-control" 
        value="${longitude}"
        placeholder="Longitude"
        style="flex-grow: 1;"
        readOnly
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
    const attached = super.attach(element);

    this.loadRefs(element, {
      latitude: "single",
      longitude: "single",
      gpsButton: "single",
    });

    // Restore value from Formio data model
    const value = this.getValue();
    if (this.refs.latitude && this.refs.longitude && value) {
      const [latitude, longitude] = value.split(",");
      this.refs.latitude.value = latitude;
      this.refs.longitude.value = longitude;
    }

    if (!this.component.disabled) {
      if (this.refs.latitude && this.refs.longitude) {
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
      }

      if (this.refs.gpsButton) {
        this.refs.gpsButton.addEventListener("click", () => {
          this.getLocation();
        });
      }
    }

    return attached;
  }

  getLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
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
        alert("Geolocation error: " + error.message);
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

  getValue() {
    const value = super.getValue();
    return value;
  }

  setValue(value, flags = {}) {
    if (this.dataValue !== value) {
      // Ensure the value is set in Formio's data model
      super.setValue(value, flags);
      
      // Only trigger change if not noUpdateEvent
      if (!flags.noUpdateEvent) {
        this.triggerChange();
      }
    }
    
    // Always update input fields even with noUpdateEvent flag
    if (this.refs && this.refs.latitude && this.refs.longitude) {
      const [latitude, longitude] = value ? value.split(",") : ["", ""];
      this.refs.latitude.value = latitude;
      this.refs.longitude.value = longitude;
    }
  }

  updateValue(value, flags = {}) {
    if (this.dataValue !== value) {
      // Always ensure modified and touched are set, even with noUpdateEvent
      const updatedFlags = { 
        ...flags, 
        modified: true, 
        touched: true
      };
      super.updateValue(value, updatedFlags);
      
      // Only trigger change if not noUpdateEvent
      if (!flags.noUpdateEvent) {
        this.triggerChange(updatedFlags);
      }
    }
    // Rely on Formio's built-in validation and redraw
    this.redraw();
  }

  get emptyValue(){
    return "";
  }
}

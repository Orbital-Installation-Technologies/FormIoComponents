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

  validateLatLon(lat, lon, refs, { requireBoth = true, required = true } = {}) {
    const errors = [];
    const { latitudeRef, longitudeRef } = refs;
    const latMissing = lat === null || lat === undefined || Number.isNaN(lat);
    const lonMissing = lon === null || lon === undefined || Number.isNaN(lon);
    if (latMissing && lonMissing) {
      if (required) {
        errors.push({ key: 'gps_missing', message: 'GPS Coordinates is required', type: 'custom' });
      }
      return errors;
    }
    if (requireBoth) {
      if (latMissing) {
        errors.push({ key: 'lat_missing', message: 'Latitude is required', type: 'custom' });
      }
      if (lonMissing) {
        errors.push({ key: 'lon_missing', message: 'Longitude is required', type: 'custom' });
      }
    }
    if (!latMissing && (lat < -90 || lat > 90)) {
      errors.push({ key: 'lat_out_of_range', message: 'Latitude must be between -90 and 90.' , type: "custom"});
    }
    if (!lonMissing && (lon < -180 || lon > 180)) {
      errors.push({ key: 'lon_out_of_range', message: 'Longitude must be between -180 and 180.' , type: "custom"});
    }
    return errors;
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
    // Determine validation state for rendering highlights
    var latitudeClass = "form-control"
    var longitudeClass = "form-control";
    if (this.errorMessage) {
      if (this.errorMessage.toLowerCase().includes('latitude')) {
        latitudeClass += " is-invalid";
      }
      if (this.errorMessage.toLowerCase().includes('longitude')) {
        longitudeClass += " is-invalid";
      }
      if (this.errorMessage.toLowerCase().includes('gps')) {
        latitudeClass += " is-invalid";
        longitudeClass += " is-invalid";
      }
    }
    let component = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">`;
    component += `
      <input 
        ref="latitude" 
        type="number" 
        class="${latitudeClass}"
        value="${latitude}"
        placeholder="Latitude"
        style="flex-grow: 1;"
      >
      <input 
        ref="longitude" 
        type="number" 
        class="${longitudeClass}" 
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
        <div ref="messageContainer" class="form-text error">${this.errorMessage}</div>
      </div>`;
    }
    component += `</div>`;
    return super.render(component);
  }
  getMaxVisibleDigits(input) {
    if (!input) return 0;
    const style = window.getComputedStyle(input);
    const fontSize = parseFloat(style.fontSize);
    const padding =
      parseFloat(style.paddingLeft || 0) +
      parseFloat(style.paddingRight || 0);
    const width = input.clientWidth - padding;
    const avgDigitWidth = fontSize * 0.6; // average for '0'..'9' in most sans-serif fonts
    return Math.floor(width / avgDigitWidth);
  }

  // In your class extending FieldComponent:
  validate(required, value) {
    const [latitude, longitude] = (value || "").split(",");
    const latNum = latitude ? parseFloat(latitude) : null;
    const lonNum = longitude ? parseFloat(longitude) : null;
    const errors = this.validateLatLon(
      latNum, lonNum,
      { latitudeRef: this.refs.latitude, longitudeRef: this.refs.longitude },
      { requireBoth: true, required: !!required }
    );

    if (errors.length > 0) {
      // Remove/add class after value update (and any potential rerender)
      this.refs.latitude.classList.toggle("is-invalid", errors.some(e=>e.key.includes("lat") || e.key === "gps_missing"));
      this.refs.longitude.classList.toggle("is-invalid", errors.some(e=>e.key.includes("lon") || e.key === "gps_missing"));

      this.errorMessage = errors[0].message;
      this.setCustomValidity(errors[0].key, errors[0].message);
      return errors.map(e => ({ message: e.message, key: e.key, type: 'custom' }));
    }else{
      // Clear error
      this.errorMessage = '';
      this.setCustomValidity('', '');
      return [];
    }
  }

  isValid() {
    const errors = this.validate(this.component.validate?.required, this.getValue());
    this._errors = errors;
    this._visibleErrors = errors;

    if (errors.length > 0) {
      this.setCustomValidity(errors[0].key, errors[0].message);
    } else {
      this.setCustomValidity('', '');
    }
    return errors.length === 0;
  }

  checkValidity(data, dirty, rowData) {
    const errors = this.validate(this.component.validate?.required, this.getValue());
    return errors.length === 0;
  }

  attach(element) {
    const attached = super.attach(element);
    this.loadRefs(element, {
      latitude: "single",
      longitude: "single",
      gpsButton: "single",
    });

    const latitudeField = this.refs.latitude;
    const longitudeField = this.refs.longitude;


    if (!latitudeField || !longitudeField) return attached;

    // Initialize values
    const value = this.getValue();
    if (value) {
      const [lat, lon] = value.split(",");
      latitudeField.value = lat || "";
      longitudeField.value = lon || "";
    }


    if (!this.component.disabled) {

      const handleChange = () => {
        const maxDigits = this.getMaxVisibleDigits(latitudeField);  // both have the same size


        const truncateDigits = val => val ? val.toString().slice(0, maxDigits) : "";

        var lat = latitudeField.value;
        var lon = longitudeField.value;

        lat = Number(lat).toFixed(6);
        lon = Number(lon).toFixed(6);
        const errors = this.validate(true, `${lat},${lon}`);

        this.errorMessage = errors.length ? errors[0].message : "";
        this.setCustomValidity(errors.length ? errors[0].key : "", this.errorMessage);

        this.updateValue(`${lat},${lon}`, { modified: true });
        // Reacquire refs AFTER updateValue if needed
        this.loadRefs(this.element, {
          latitude: "single",
          longitude: "single"
        });
        this.updateState();
        this.refs.latitude.value = truncateDigits(lat);
        this.refs.longitude.value = truncateDigits(lon);

      };

      // Attach a single handler to both fields
      latitudeField.addEventListener("change", handleChange);
      longitudeField.addEventListener("change", handleChange);
    }

    if (this.refs.gpsButton) {
      this.refs.gpsButton.addEventListener("click", () => {
        this.getLocation();
      });
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
        var { latitude, longitude } = position.coords;
        if (this.errorMessage !== "") {
          this.setError(null);
          this.updateState();
        }
        const maxDigits = this.getMaxVisibleDigits(this.refs.latitude);  // both have the same size
        const truncateDigits = val => val ? val.toString().slice(0, maxDigits) : "";

        latitude = Number(latitude).toFixed(6);
        longitude = Number(longitude).toFixed(6);
        this.updateValue(`${latitude},${longitude}`);
        if (this.refs.latitude) {
          this.refs.latitude.value = truncateDigits(latitude);
        }
        if (this.refs.longitude) {
          this.refs.longitude.value = truncateDigits(longitude);
        }
        this.fetchedInitially = true;
        if (this.refs.latitude) {
          this.refs.latitude.style.pointerEvents = 'none';
          this.refs.latitude.style.setProperty('background-color', '#E9ECEF', 'important');
        }
        if (this.refs.longitude) {
          this.refs.longitude.style.pointerEvents = 'none';
          this.refs.longitude.style.setProperty('background-color', '#E9ECEF', 'important');
        }
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

      super.setValue(value, flags);

      if (!flags.noUpdateEvent) {
        this.triggerChange();
      }
    }

    if (this.refs && this.refs.latitude && this.refs.longitude) {
      const [latitude, longitude] = value ? value.split(",") : ["", ""];
      this.refs.latitude.value = latitude;
      this.refs.longitude.value = longitude;
    }
  }

  updateValue(value, flags = {}) {
    if (this.dataValue !== value) {

      const updatedFlags = {
        ...flags,
        modified: true,
        touched: true
      };
      super.updateValue(value, updatedFlags);

      if (!flags.noUpdateEvent) {
        this.triggerChange(updatedFlags);
      }
    }

    this.redraw();
  }

  get emptyValue(){
    return "";
  }
}

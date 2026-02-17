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
    // Battery optimization: Track geolocation request to prevent multiple simultaneous requests
    this._geolocationRequestInProgress = false;
    // Battery optimization: Cache computed styles to avoid repeated getComputedStyle calls
    this._cachedMaxDigits = null;
    // Battery optimization: Store bound event handlers for proper cleanup
    this._boundHandlers = {
      handleChange: null,
      getLocationClick: null
    };
    // Battery optimization: Store timeout IDs for cleanup
    this._timeoutIds = [];
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
        style="flex-grow: 1; pointer-events: none; background-color: #E9ECEF !important;"
        readonly
      >
      <input 
        ref="longitude" 
        type="number" 
        class="${longitudeClass}" 
        value="${longitude}"
        placeholder="Longitude"
        style="flex-grow: 1; pointer-events: none; background-color: #E9ECEF !important;"
        readonly
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
    // Battery optimization: Cache computed style to avoid repeated expensive calls
    if (this._cachedMaxDigits !== null) {
      return this._cachedMaxDigits;
    }
    const style = window.getComputedStyle(input);
    const fontSize = parseFloat(style.fontSize);
    const padding =
      parseFloat(style.paddingLeft || 0) +
      parseFloat(style.paddingRight || 0);
    const width = input.clientWidth - padding;
    const avgDigitWidth = fontSize * 0.6; // average for '0'..'9' in most sans-serif fonts
    this._cachedMaxDigits = Math.floor(width / avgDigitWidth);
    return this._cachedMaxDigits;
  }

  validate(required, value) {
    const [latitude, longitude] = (value || "").split(",");
    const latNum = latitude ? parseFloat(latitude) : null;
    const lonNum = longitude ? parseFloat(longitude) : null;

    const errors = this.validateLatLon(
      latNum,
      lonNum,
      { latitudeRef: this.refs?.latitude, longitudeRef: this.refs?.longitude },
      { requireBoth: true, required: !!required }
    );

    if (errors.length > 0) {
      // Safely toggle invalid class
      if (this.refs?.latitude) {
        this.refs.latitude.classList.toggle(
          "is-invalid",
          errors.some(e => e.key.includes("lat") || e.key === "gps_missing")
        );
      }
      if (this.refs?.longitude) {
        this.refs.longitude.classList.toggle(
          "is-invalid",
          errors.some(e => e.key.includes("lon") || e.key === "gps_missing")
        );
      }

      this.errorMessage = errors[0].message;
      this.setCustomValidity(errors[0].key, errors[0].message);

      // Update Form.io internal error tracking for review
      this._errors = errors.map(e => ({ message: e.message, key: e.key, type: 'custom' }));
      this._visibleErrors = [...this._errors];

      return this._errors;
    } else {
      // Clear error state completely
      this.errorMessage = '';
      this.setCustomValidity('', '');
      this._errors = [];
      this._visibleErrors = [];

      // Remove invalid classes if refs exist
      if (this.refs?.latitude) this.refs.latitude.classList.remove("is-invalid");
      if (this.refs?.longitude) this.refs.longitude.classList.remove("is-invalid");

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
  trimTo6DecimalsNumber(value) {
    const n = value ? Number(value) : null;
    if (!Number.isFinite(n)) return value;
    return Number(n.toString().replace(/(\.\d{6})\d+$/, '$1'));
  }
  // Battery optimization: Debounce handleChange to reduce CPU usage
  handleChange = (() => {
    let timeoutId = null;
    return () => {
      // Clear previous timeout
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        this._timeoutIds = this._timeoutIds.filter(id => id !== timeoutId);
      }
      
      // Debounce the actual work
      timeoutId = setTimeout(() => {
        if (!this.refs?.latitude || !this.refs?.longitude) return;
        
        const latitudeField = this.refs.latitude;
        const longitudeField = this.refs.longitude;
        const maxDigits = this.getMaxVisibleDigits(latitudeField);  // both have the same size
        const truncateDigits = val => val ? val.toString().slice(0, maxDigits) : "";

        var latitude = latitudeField.value;
        var longitude = longitudeField.value;

        latitude = this.trimTo6DecimalsNumber(latitude);
        longitude = this.trimTo6DecimalsNumber(longitude);
        const errors = this.validate(true, `${latitude},${longitude}`);

        this.errorMessage = errors.length ? errors[0].message : "";
        this.setCustomValidity(errors.length ? errors[0].key : "", this.errorMessage);

        this.updateValue(`${latitude},${longitude}`, { modified: true });
        // Reacquire refs AFTER updateValue if needed
        this.loadRefs(this.element, {
          latitude: "single",
          longitude: "single"
        });
        
        // Battery optimization: Use requestAnimationFrame for DOM updates
        requestAnimationFrame(() => {
          this.updateState();
          if (this.refs?.latitude) {
            this.refs.latitude.value = truncateDigits(latitude);
          }
          if (this.refs?.longitude) {
            this.refs.longitude.value = truncateDigits(longitude);
          }
        });
        
        this._timeoutIds = this._timeoutIds.filter(id => id !== timeoutId);
      }, 300); // Debounce to 300ms
      
      this._timeoutIds.push(timeoutId);
    };
  })();
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
      // Battery optimization: Store bound handlers for proper cleanup
      this._boundHandlers.handleChange = this.handleChange.bind(this);
      
      // Attach a single handler to both fields
      latitudeField.addEventListener("change", this._boundHandlers.handleChange, { passive: true });
      longitudeField.addEventListener("change", this._boundHandlers.handleChange, { passive: true });
    }

    if (this.refs.gpsButton) {
      // Battery optimization: Store bound handler for proper cleanup
      this._boundHandlers.getLocationClick = () => {
        this.getLocation();
      };
      this.refs.gpsButton.addEventListener("click", this._boundHandlers.getLocationClick);
    }
    return attached;
  }

  getLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
      return;
    }

    // Battery optimization: Prevent multiple simultaneous geolocation requests
    if (this._geolocationRequestInProgress) {
      return;
    }
    
    this._geolocationRequestInProgress = true;
    
    // Battery optimization: Disable button during request to prevent multiple clicks
    if (this.refs.gpsButton) {
      this.refs.gpsButton.disabled = true;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this._geolocationRequestInProgress = false;
        
        // Battery optimization: Re-enable button
        if (this.refs.gpsButton) {
          this.refs.gpsButton.disabled = false;
        }
        
        var { latitude, longitude } = position.coords;
        if (this.errorMessage !== "") {
          this.setError(null);
        }
        
        const maxDigits = this.getMaxVisibleDigits(this.refs.latitude);  // both have the same size
        const truncateDigits = val => val ? val.toString().slice(0, maxDigits) : "";

        latitude = this.trimTo6DecimalsNumber(latitude);
        longitude = this.trimTo6DecimalsNumber(longitude);
        this.updateValue(`${latitude},${longitude}`);
        
        // Battery optimization: Batch DOM updates using requestAnimationFrame
        requestAnimationFrame(() => {
          if (this.refs.latitude) {
            this.refs.latitude.value = truncateDigits(latitude);
            this.refs.latitude.style.pointerEvents = 'none';
            this.refs.latitude.style.setProperty('background-color', '#E9ECEF', 'important');
          }
          if (this.refs.longitude) {
            this.refs.longitude.value = truncateDigits(longitude);
            this.refs.longitude.style.pointerEvents = 'none';
            this.refs.longitude.style.setProperty('background-color', '#E9ECEF', 'important');
          }
          this.fetchedInitially = true;
          this.updateState();
        });
      },
      (error) => {
        this._geolocationRequestInProgress = false;
        
        // Battery optimization: Re-enable button
        if (this.refs.gpsButton) {
          this.refs.gpsButton.disabled = false;
        }
        
        alert("Geolocation error: " + error.message);
        this.fetchedInitially = true;
        this.setError("Unable to retrieve location.");
        
        // Battery optimization: Use requestAnimationFrame for DOM updates
        requestAnimationFrame(() => {
          this.updateState();
        });
      },
      {
        enableHighAccuracy: false, // Battery optimization: Set to false to reduce battery drain
        timeout: 10000,            // Don't let the GPS search forever
        maximumAge: 300000         // Battery optimization: Use cached location up to 5 minutes (increased from 1 minute)
      }
    );
  }

  // Battery optimization: Throttle updateState to reduce redraws
  updateState = (() => {
    let rafId = null;
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        this.triggerChange();
        this.redraw();
        rafId = null;
      });
    };
  })();

  setError(message) {
    // Battery optimization: Clear any existing timeout
    this._timeoutIds.forEach(id => clearTimeout(id));
    this._timeoutIds = [];
    
    if (message) {
      this.errorMessage = message;
      const timeoutId = setTimeout(() => {
        this.errorMessage = "";
        // Battery optimization: Use requestAnimationFrame for DOM updates
        requestAnimationFrame(() => {
          this.updateState();
        });
        this._timeoutIds = this._timeoutIds.filter(id => id !== timeoutId);
      }, 3000);
      this._timeoutIds.push(timeoutId);
    } else {
      this.errorMessage = "";
    }
  }

  detach() {
    // Battery optimization: Properly remove event listeners using stored bound handlers
    if (this.refs.gpsButton && this._boundHandlers.getLocationClick) {
      this.refs.gpsButton.removeEventListener("click", this._boundHandlers.getLocationClick);
      this._boundHandlers.getLocationClick = null;
    }
    if (this.refs.latitude && this._boundHandlers.handleChange) {
      this.refs.latitude.removeEventListener("change", this._boundHandlers.handleChange);
    }
    if (this.refs.longitude && this._boundHandlers.handleChange) {
      this.refs.longitude.removeEventListener("change", this._boundHandlers.handleChange);
    }
    this._boundHandlers.handleChange = null;
    
    // Battery optimization: Clear all timeouts
    this._timeoutIds.forEach(id => clearTimeout(id));
    this._timeoutIds = [];
    
    // Battery optimization: Reset geolocation request flag
    this._geolocationRequestInProgress = false;
    
    // Battery optimization: Clear cached values
    this._cachedMaxDigits = null;
    
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
    
    // Battery optimization: Use requestAnimationFrame for DOM updates
    if (this.refs?.latitude && this.refs?.longitude) {
      requestAnimationFrame(() => {
        const [lat, lon] = value ? value.split(",") : ["", ""];
        if (this.refs?.latitude) {
          this.refs.latitude.value = lat || "";
        }
        if (this.refs?.longitude) {
          this.refs.longitude.value = lon || "";
        }
      });
    }
  }

  get emptyValue(){
    return "";
  }
}

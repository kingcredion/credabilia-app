/**
 * Loads the Google Maps JavaScript API (async loader) and returns
 * the places library via google.maps.importLibrary("places").
 *
 * Uses the newer `loading=async` script tag which is required for
 * importLibrary() to work correctly.
 */

let scriptLoadPromise = null;

function loadScript(apiKey) {
  if (scriptLoadPromise) return scriptLoadPromise;

  // Already loaded by a previous call
  if (window.google?.maps) {
    scriptLoadPromise = Promise.resolve();
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gmp="true"]');
    if (existing) {
      // Script tag exists but may still be loading
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", () => {
        scriptLoadPromise = null;
        reject(new Error("Google Maps script failed to load"));
      });
      return;
    }

    const script = document.createElement("script");
    // loading=async is required for importLibrary()
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.gmp = "true";

    script.onload = () => {
      console.log("[GoogleMaps] Script loaded successfully");
      resolve();
    };
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load Google Maps script"));
    };

    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Returns the Google Maps Places library (new importLibrary API).
 * Call once per session; subsequent calls return cached result.
 */
let placesLibrary = null;

export async function loadGooglePlacesLibrary(apiKey) {
  await loadScript(apiKey);

  if (placesLibrary) return placesLibrary;

  if (!window.google?.maps?.importLibrary) {
    throw new Error("google.maps.importLibrary not available");
  }

  placesLibrary = await window.google.maps.importLibrary("places");
  console.log("[GoogleMaps] Places library loaded:", Object.keys(placesLibrary));
  return placesLibrary;
}

/**
 * Parses Google address_components into our address fields.
 */
export function parseAddressComponents(components = []) {
  const find = (type) => components.find((c) => c.types?.includes(type));

  const streetNumber = find("street_number")?.long_name || "";
  const route = find("route")?.long_name || "";
  const city =
    find("locality")?.long_name ||
    find("postal_town")?.long_name ||
    find("sublocality_level_1")?.long_name ||
    find("sublocality")?.long_name ||
    "";
  const state = find("administrative_area_level_1")?.short_name || "";
  const postalCode = find("postal_code")?.long_name || "";
  const country = find("country")?.short_name || "US";
  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();

  return { line1, city, state, postal_code: postalCode, country };
}

/**
 * Placeholder for future Google Address Validation API integration.
 * Call after user selects/confirms an address to normalize it.
 * Does NOT block save — just logs for now.
 */
export async function validateAddressWithGoogle(address) {
  // TODO: call Address Validation API (POST https://addressvalidation.googleapis.com/v1:validateAddress)
  // Requires separate billing-enabled Address Validation API key
  console.log("[AddressValidation] Placeholder — address to validate:", address);
  return { valid: true, normalized: address };
}
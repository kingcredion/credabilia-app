import React, { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadGooglePlacesLibrary } from "@/lib/loadGooglePlaces";

export default function AddressForm({ form, setForm, apiKey, line2Ref }) {
  const [predictions, setPredictions] = useState([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [isLoadingPredictions, setIsLoadingPredictions] = useState(false);
  const debounceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const line1InputRef = useRef(null);
  const wrapperRef = useRef(null);

  const f = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  // ── Prediction fetch ──────────────────────────────────────────────────────
   async function handleLine1Change(e) {
     const value = e.target.value;
     setForm((prev) => ({ ...prev, address_line1: value }));
     console.log("[AddressForm] address_line1 input changed", value);

    clearTimeout(debounceRef.current);

    if (!apiKey || !value || value.trim().length < 3) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        console.log("[AddressForm] fetching predictions");
        setIsLoadingPredictions(true);

        const lib = await loadGooglePlacesLibrary(apiKey);

        // AutocompleteSessionToken + fetchAutocompleteSuggestions are in the Places library
        const { AutocompleteSessionToken, AutocompleteSuggestion } = lib;

        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        console.log("[AddressForm] autocomplete request", {
          input: value,
          hasSessionToken: !!sessionTokenRef.current,
          includedRegionCodes: ["us"],
          region: "us",
          language: "en-US",
          includedPrimaryTypes: ["street_address", "premise", "subpremise", "establishment"],
        });

        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ["us"],
          region: "us",
          language: "en-US",
          includedPrimaryTypes: ["street_address", "premise", "subpremise", "establishment"],
        });

        console.log("[AddressForm] raw suggestions", suggestions);
        const fetchedPredictions = (suggestions || [])
          .map((s) => s.placePrediction)
          .filter(Boolean);

        setPredictions(fetchedPredictions);
        setShowPredictions(fetchedPredictions.length > 0);
        console.log("[AddressForm] valid place predictions", fetchedPredictions);
        console.log("[AddressForm] predictions loaded", fetchedPredictions.length);
      } catch (err) {
        console.error("[AddressForm] prediction fetch failed", err);
        setPredictions([]);
        setShowPredictions(false);
      } finally {
        setIsLoadingPredictions(false);
      }
    }, 250);
  }

  // ── Prediction selection ──────────────────────────────────────────────────
  async function handlePredictionSelect(prediction) {
    try {
      console.log("[AddressForm] selected prediction text", prediction?.text?.text);

      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents"] });

      const components = place.addressComponents || [];

      let streetNumber = "";
      let route = "";
      let city = "";
      let state = "";
      let postalCode = "";
      let postalSuffix = "";
      let country = "US";

      for (const c of components) {
        const types = c.types || [];
        if (types.includes("street_number")) streetNumber = c.longText || "";
        if (types.includes("route")) route = c.shortText || c.longText || "";
        if (types.includes("locality") && !city) city = c.longText || "";
        if (types.includes("postal_town") && !city) city = c.longText || "";
        if (types.includes("sublocality_level_1") && !city) city = c.longText || "";
        if (types.includes("administrative_area_level_1")) state = c.shortText || c.longText || "";
        if (types.includes("postal_code")) postalCode = c.longText || "";
        if (types.includes("postal_code_suffix")) postalSuffix = c.longText || "";
        if (types.includes("country")) country = c.shortText || "US";
      }

      const line1 = `${streetNumber} ${route}`.trim();
      const zip = postalSuffix ? `${postalCode}-${postalSuffix}` : postalCode;

      const parsed = { line1, city, state, postal_code: zip, country };
      console.log("[AddressForm] parsed address result", parsed);


      setForm((prev) => ({
        ...prev,
        address_line1: line1,
        city,
        state,
        postal_code: zip,
        country: country || "US",
      }));
      console.log("[AddressForm] Google suggestion populated:", { line1, city, state, postal_code: zip, country });

      setPredictions([]);
      setShowPredictions(false);
      sessionTokenRef.current = null; // new session after selection

      setTimeout(() => line2Ref?.current?.focus(), 50);
    } catch (err) {
      console.error("[AddressForm] prediction select failed", err);
    }
  }

  function handleBlur(e) {
    // Hide dropdown unless focus moved to a prediction item inside the wrapper
    if (wrapperRef.current && wrapperRef.current.contains(e.relatedTarget)) return;
    setShowPredictions(false);
  }

  return (
    <div className="space-y-3">
      {/* Row 1: label + full name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Label</Label>
          <Input value={form.label} onChange={f("label")} placeholder="Home" />
        </div>
        <div>
          <Label className="text-xs">Full Name *</Label>
          <Input value={form.recipient_name} onChange={f("recipient_name")} placeholder="Jane Doe" />
        </div>
      </div>

      {/* Street Address — single input, predictions below */}
      <div ref={wrapperRef} className="relative" onBlur={handleBlur}>
        <Label className="text-xs">Street Address *</Label>
        <Input
          ref={line1InputRef}
          value={form.address_line1}
          onChange={handleLine1Change}
          placeholder="123 Main St"
          autoComplete="off"
          onFocus={() => predictions.length > 0 && setShowPredictions(true)}
        />
        <p className="text-xs text-gray-400 mt-1">Type an address or business name, then select a suggestion to autofill the rest.</p>
        {showPredictions && (
          <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-lg max-h-52 overflow-y-auto text-sm">
            {isLoadingPredictions && (
              <li className="px-3 py-2 text-gray-400 dark:text-muted-foreground text-xs">Searching…</li>
            )}
            {predictions.map((p, i) => (
              <li
                key={i}
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                onClick={() => handlePredictionSelect(p)}
                onKeyDown={(e) => e.key === "Enter" && handlePredictionSelect(p)}
                className="px-3 py-2 cursor-pointer text-gray-900 dark:text-foreground hover:bg-blue-50 dark:hover:bg-blue-900/30 focus:bg-blue-50 dark:focus:bg-blue-900/30 outline-none border-b last:border-b-0 border-gray-100 dark:border-border"
              >
                {p.text?.text || p.description || ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Line 2 */}
      <div>
        <Label className="text-xs">Apt / Suite (optional)</Label>
        <Input
          ref={line2Ref}
          value={form.address_line2}
          onChange={f("address_line2")}
          placeholder="Apt 4B"
          autoComplete="address-line2"
        />
      </div>

      {/* City / State / ZIP */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">City *</Label>
          <Input value={form.city} onChange={f("city")} autoComplete="address-level2" />
        </div>
        <div>
          <Label className="text-xs">State *</Label>
          <Input value={form.state} onChange={f("state")} placeholder="CA" autoComplete="address-level1" />
        </div>
        <div>
          <Label className="text-xs">ZIP *</Label>
          <Input value={form.postal_code} onChange={f("postal_code")} autoComplete="postal-code" />
        </div>
      </div>

      {/* Country / Phone */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Country *</Label>
          <Input value={form.country} onChange={f("country")} autoComplete="country" />
        </div>
        <div>
          <Label className="text-xs">Phone (optional)</Label>
          <Input value={form.phone} onChange={f("phone")} autoComplete="tel" />
        </div>
      </div>

      {/* Default checkbox */}
      <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
          className="rounded"
        />
        Set as default shipping address
      </label>
    </div>
  );
}
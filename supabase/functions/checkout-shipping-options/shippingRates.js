// Shared shipping-rate helpers. Each Supabase edge function deploys as an isolated bundle, so this file is copied into every function
// that needs it (create-checkout-session, checkout-shipping-options, shippo-get-rates, shippo-buy-label). tests/shippingRates.test.js
// fails if the copies drift apart -- edit one, then copy it over the others.

export function shippoAddress(a, email) {
  return {name:a?.name||'',street1:a?.street1||'',street2:a?.street2||'',city:a?.city||'',state:a?.state||'',zip:a?.zip||'',country:a?.country||'',phone:a?.phone||'',email:email||''};
}

// One carrier rate from Shippo, in the shape the rest of the system uses. Cents everywhere. `amount_cents` is the full carrier price
// (insurance included when the quote was insured); `insurance_cents` is the part of it that is insurance.
export function normalizeRate(rate) {
  const service=rate?.servicelevel?.token || '';
  return {
    rate_id:rate?.object_id, provider:rate?.provider || '', service, name:rate?.servicelevel?.name || service,
    amount_cents:Math.round(parseFloat(rate?.amount)*100),
    insurance_cents:Math.round(parseFloat(rate?.included_insurance_price||0)*100),
    estimated_days:rate?.estimated_days ?? null,
  };
}

// Usable options, one per carrier service (cheapest if a service appears twice), cheapest first.
export function normalizeRates(rates) {
  const best=new Map();
  for(const rate of rates||[]) {
    if(!rate?.amount || !rate?.object_id || !rate?.servicelevel?.token) continue;
    const option=normalizeRate(rate);
    if(!Number.isFinite(option.amount_cents) || option.amount_cents<=0) continue;
    const key=`${option.provider.toLowerCase()}|${option.service}`;
    if(!best.has(key) || option.amount_cents<best.get(key).amount_cents) best.set(key,option);
  }
  return [...best.values()].sort((a,b)=>a.amount_cents-b.amount_cents);
}

// What the buyer pays for an option: shipping and insurance each carry the marketplace markup (1 for King's Collection items).
export function buyerPrice(option, markup) {
  return {shipping_cents:Math.round((option.amount_cents-option.insurance_cents)*markup), insurance_cents:Math.round(option.insurance_cents*markup)};
}

export function findChoice(options, choice) {
  if(!choice || typeof choice.provider!=='string' || typeof choice.service!=='string') return null;
  return options.find(option=>option.provider.toLowerCase()===choice.provider.toLowerCase() && option.service===choice.service) || null;
}

// The most a label may cost over what the buyer's choice was quoted at checkout. Carrier prices move a little between checkout and
// shipping; anything beyond this is held for a person instead of being absorbed.
export function maxLabelCents(quoteCents) {
  return Math.max(Math.ceil(quoteCents*1.25), quoteCents+300);
}

// Orders at or above this price need a delivery signature, the strongest proof against a 'never arrived' chargeback. Keep in step with
// checkout_risk_profile in the database (signature_required).
export const SIGNATURE_OVER_CENTS=50000;
export const needsSignature=priceCents=>Number(priceCents)>=SIGNATURE_OVER_CENTS;

// Asks Shippo for rates. If an insured quote returns nothing (not every carrier account supports insurance) it falls back to a plain
// quote, and says so in `insured`. The same goes for `signature` (a delivery signature): if no carrier offers it for this parcel the buyer
// still gets a normal quote, and `signed` says it was left off.
export async function quoteRates({shippoKey, from, to, parcel, insurance, signature=false, fetchImpl=fetch}) {
  const ask=(insure,sign)=>fetchImpl('https://api.goshippo.com/shipments/',{
    method:'POST',
    headers:{Authorization:`ShippoToken ${shippoKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      address_from:from, address_to:to,
      parcels:[{length:String(parcel.length_in),width:String(parcel.width_in),height:String(parcel.height_in),distance_unit:'in',weight:String(parcel.weight_oz),mass_unit:'oz'}],
      extra:(insure || sign) ? {...(insure?{insurance:{amount:String(insure.amount_cents/100),currency:'usd',content:String(insure.content||'Item').slice(0,100)}}:{}),...(sign?{signature_confirmation:'STANDARD'}:{})} : undefined,
      async:false,
    }),
  }).then(r=>r.json());
  let signed=!!signature, insured=!!insurance;
  let shipment=await ask(insurance||null,signed);
  let options=normalizeRates(shipment.rates);
  if(!options.length && insured) {
    shipment=await ask(null,signed);
    options=normalizeRates(shipment.rates);
    insured=false;
  }
  if(!options.length && signed) {
    signed=false;
    insured=!!insurance;
    shipment=await ask(insurance||null,false);
    options=normalizeRates(shipment.rates);
    if(!options.length && insured) {
      shipment=await ask(null,false);
      options=normalizeRates(shipment.rates);
      insured=false;
    }
  }
  return {options, insured, signed, shipmentId:shipment.object_id};
}

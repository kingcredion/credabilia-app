// Shipping and insurance are passed through at the carrier rate for King's Collection items (sold and
// fulfilled by Credabilia itself); items from other sellers carry Credabilia's 10% markup.
export function shippingMarkupFactor(isKingCollection) {
  return isKingCollection===true ? 1 : 1.10;
}

import React from 'react';
import { DETAIL_FIELDS, detailKeys } from './listingDetails.js';

export function ListingDetailFields({category}) {
  return <details><summary>Item details and search tags (optional)</summary>
    <p className="field-note">Add only details you know. These are seller-provided descriptions, not authentication.</p>
    <div className="form-stack">{detailKeys(category).map(key => <label key={key}>{DETAIL_FIELDS[key]}<input name={'attribute:' + key} maxLength={120}/></label>)}
      <label>Search tags<input name="tags" placeholder="baseball, jersey, chicago" maxLength={334}/></label>
      <p className="field-note">Up to eight descriptive tags, separated by commas. Tags do not affect credibility.</p>
    </div>
  </details>;
}
export function ListingDetailSummary({item}) {
  const fields = Object.entries(item.attributes || {}).filter(([key,value]) => DETAIL_FIELDS[key] && value);
  if (!fields.length && !item.tags?.length) return null;
  return <section className="evidence-box"><h3>Item details</h3><p className="field-note">Provided by the seller</p>
    <dl>{fields.map(([key,value]) => <React.Fragment key={key}><dt>{DETAIL_FIELDS[key]}</dt><dd>{value}</dd></React.Fragment>)}</dl>
    {!!item.tags?.length && <p>Search tags: {item.tags.join(', ')}</p>}
  </section>;
}

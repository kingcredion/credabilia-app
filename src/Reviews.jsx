import React, { useState } from 'react';
import { Flag, ShieldCheck } from 'lucide-react';
import { RatingStars } from './ItemArt.jsx';

const PAGE = 20;
const REASONS = ['Abusive or hateful', 'Not a real customer', 'Not about this seller or sale', 'Spam or advertising', 'Something else'];

// One public review: stars, the buyer's words, who ("Pat J." only) and what they bought. Anyone signed in can report it.
function ReviewCard({ review, service }) {
  const [reporting, setReporting] = useState(false), [reason, setReason] = useState(REASONS[0]), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [done, setDone] = useState(false);
  async function report(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    try { await service.reportContent('review', review.id, reason, null); setDone(true); setReporting(false); }
    catch (err) { setMessage(/sign in/i.test(err.message) ? 'Sign in to report a review.' : err.message); } finally { setBusy(false); }
  }
  return <div className="evidence-box review-card">
    <RatingStars value={review.rating} size={16}/>
    <p>{review.comment || <em>Rated without a comment.</em>}</p>
    <p className="field-note review-meta"><strong>{review.reviewer}</strong> · <span className="verified"><ShieldCheck size={13}/> Verified purchase</span>{review.item_title ? <> · {review.item_title}</> : null} · {new Date(review.created_at).toLocaleDateString()}</p>
    {done ? <p className="field-note" role="status">Thanks. Our team will take a look.</p>
      : !reporting ? <button type="button" className="text-button review-report" onClick={() => setReporting(true)}><Flag size={13}/> Report</button>
      : <form className="review-report-form" onSubmit={report}>
          <label>Why are you reporting this review?<select value={reason} onChange={event => setReason(event.target.value)} disabled={busy}>{REASONS.map(option => <option key={option}>{option}</option>)}</select></label>
          <div className="form-row"><button className="primary compact" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setReporting(false)}>Cancel</button></div>
        </form>}
    {message && <p role="alert" className="error">{message}</p>}
  </div>;
}

// The seller's reviews on their storefront: the first page arrives with the storefront, "Show more" loads the rest.
export function ReviewList({ slug, firstPage, total, service }) {
  const [reviews, setReviews] = useState(firstPage || []), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function more() {
    setBusy(true); setError('');
    try { const next = await service.getSellerReviews(slug, PAGE, reviews.length); setReviews(current => [...current, ...(next?.reviews || [])]); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!reviews.length) return null;
  return <div className="form-stack">
    {reviews.map(review => <ReviewCard key={review.id} review={review} service={service}/>)}
    {reviews.length < (total || 0) && <button type="button" className="text-button" disabled={busy} onClick={more}>{busy ? 'Loading…' : `Show more reviews (${total - reviews.length} more)`}</button>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

// On the item page: a compact "Read N reviews" that opens the seller's latest few reviews right there, with a link to all of them.
export function SellerReviewsPeek({ listingId, count, service }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  if (!count) return null;
  function onToggle(event) {
    if (event.currentTarget.open && !data) service.getListingSellerReviews(listingId).then(setData).catch(err => setError(err.message));
  }
  return <details className="seller-reviews" onToggle={onToggle}>
    <summary>Read what buyers say about this seller ({count} {count === 1 ? 'review' : 'reviews'})</summary>
    {error ? <p role="alert" className="error">{error}</p> : !data ? <p role="status" className="field-note">Loading…</p> : <div className="form-stack">
      {data.reviews.map(review => <ReviewCard key={review.id} review={review} service={service}/>)}
      {data.slug && count > data.reviews.length && <a className="text-button" href={`/${data.slug}`}>See all {count} reviews</a>}
    </div>}
  </details>;
}

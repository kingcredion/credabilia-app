import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, ShieldCheck } from 'lucide-react';
import { RatingStars } from './ItemArt.jsx';

const STOREFRONT_PAGE = 10, ITEM_PAGE = 1; // the item page shows one review at a time (Previous / Next); a storefront shows ten per page
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

// One page of reviews at a time with Previous / Next, so a seller with a hundred reviews is a short list, not a long scroll.
// `firstPage` is page 1 when the caller already has it; `loadPage(offset, size)` returns { reviews } for any other page.
function PagedReviews({ firstPage, total, pageSize, loadPage, service }) {
  const [page, setPage] = useState(0), [reviews, setReviews] = useState(firstPage || []), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const top = useRef(null);
  const pages = Math.max(1, Math.ceil((total || reviews.length) / pageSize));
  async function go(next) {
    if (busy || next < 0 || next >= pages) return;
    setBusy(true); setError('');
    try {
      const result = next === 0 && firstPage ? { reviews: firstPage } : await loadPage(next * pageSize, pageSize);
      setReviews(result?.reviews || []); setPage(next);
      top.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!reviews.length && page === 0) return null;
  return <div className="form-stack" ref={top}>
    {reviews.map(review => <ReviewCard key={review.id} review={review} service={service}/>)}
    {pages > 1 && <nav className="review-pager" aria-label="Review pages">
      <button type="button" className="text-button" disabled={busy || page === 0} onClick={() => go(page - 1)}><ChevronLeft size={16}/> Previous</button>
      <span role="status">{pageSize === 1 ? 'Review' : 'Page'} {page + 1} of {pages}</span>
      <button type="button" className="text-button" disabled={busy || page >= pages - 1} onClick={() => go(page + 1)}>Next <ChevronRight size={16}/></button>
    </nav>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

// The seller's reviews on their storefront: page 1 arrives with the storefront, the other pages load as you flip through.
export function ReviewList({ slug, firstPage, total, service }) {
  return <PagedReviews firstPage={(firstPage || []).slice(0, STOREFRONT_PAGE)} total={total} pageSize={STOREFRONT_PAGE} service={service}
    loadPage={async (offset, size) => service.getSellerReviews(slug, size, offset)}/>;
}

// On the item page: a compact "Read N reviews" that opens the seller's reviews right there, one at a time with Previous / Next, and a link to their storefront.
export function SellerReviewsPeek({ listingId, count, service }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  if (!count) return null;
  function onToggle(event) {
    if (event.currentTarget.open && !data) service.getListingSellerReviews(listingId, ITEM_PAGE, 0).then(setData).catch(err => setError(err.message));
  }
  return <details className="seller-reviews" onToggle={onToggle}>
    <summary>Read what buyers say about this seller ({count} {count === 1 ? 'review' : 'reviews'})</summary>
    {error ? <p role="alert" className="error">{error}</p> : !data ? <p role="status" className="field-note">Loading…</p> : <>
      <PagedReviews firstPage={data.reviews} total={data.rating_count} pageSize={ITEM_PAGE} service={service}
        loadPage={async (offset, size) => service.getListingSellerReviews(listingId, size, offset)}/>
      {data.slug && <a className="text-button" href={`/${data.slug}`}>Open {data.seller_name || 'the seller'}'s storefront</a>}
    </>}
  </details>;
}

import React, { useEffect, useState } from 'react';

export function TriviaPanel({ item, service, signedIn }) {
  const [trivia, setTrivia] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');

  useEffect(() => {
    let alive = true;
    setTrivia(undefined); setError(''); setSelected('');
    service.getTrivia(item.id).then(value => { if (alive) setTrivia(value); }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [item.id]);

  async function generate() {
    setBusy(true); setError('');
    try { setTrivia(await service.generateTrivia(item.id)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || !selected) return;
    setBusy(true); setError('');
    try {
      const result = await service.submitTriviaResponse(item.id, Number(selected));
      setTrivia(await service.getTrivia(item.id));
      setError(result.already_submitted ? '' : `+${result.xp_earned} learning XP.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (trivia === undefined) return null;
  const answered = trivia && trivia.correct_index !== undefined;
  return <section className="evidence-box" aria-label="Item trivia">
    <h3>Test your eye</h3>
    {!trivia && <>
      <p className="field-note">Generate one learning question about this item — what to look for, not whether it's authentic.</p>
      {signedIn ? <button type="button" className="text-button" onClick={generate} disabled={busy}>{busy ? 'Writing a question…' : 'Generate a question'}</button>
        : <p className="field-note">Sign in to generate a question for this item.</p>}
    </>}
    {trivia && !answered && <form onSubmit={submit} className="form-stack">
      <fieldset><legend>{trivia.question}</legend><div className="verdicts">{trivia.options.map((option, index) => <label key={index}><input type="radio" name="trivia-option" value={index} checked={String(index) === selected} onChange={event => setSelected(event.target.value)} disabled={busy || !signedIn}/>{option}</label>)}</div></fieldset>
      {signedIn ? <button className="primary" disabled={busy || !selected}>{busy ? 'Checking…' : 'Submit answer'}</button> : <p className="field-note">Sign in to answer and earn learning XP.</p>}
    </form>}
    {trivia && answered && <div className="form-stack">
      <p><strong>{trivia.question}</strong></p>
      <ul>{trivia.options.map((option, index) => <li key={index}>{index === trivia.correct_index ? <strong>{option} ✓</strong> : option}{index === trivia.your_answer && index !== trivia.correct_index ? ' (your answer)' : ''}</li>)}</ul>
      <p className="field-note">{trivia.explanation}</p>
      <p className="field-note">{trivia.correct ? 'You answered correctly.' : "That wasn't the answer — the explanation above covers why."} Answering helps you learn — it does not confirm this item is authentic.</p>
    </div>}
    {error && <p role="status" className={error.startsWith('+') ? '' : 'error'}>{error}</p>}
  </section>;
}

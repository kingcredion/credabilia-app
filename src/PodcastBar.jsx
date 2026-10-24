import { X } from 'lucide-react';
import { PODCAST_BAR_TEXT } from './podcastBar.js';
import './podcastBar.css';

export default function PodcastBar({ onDismiss }) {
  return <div className="podcast-bar">
    <a className="podcast-bar-link" href="/podcast"><img src="/brand/announcement-megaphone-96.webp" alt="" width="32" height="32"/><span>{PODCAST_BAR_TEXT}</span></a>
    <button type="button" className="podcast-bar-close" aria-label="Dismiss podcast announcement" onClick={onDismiss}><X size={16}/></button>
  </div>;
}

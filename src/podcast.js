// The Memorabilia Kingdom Podcast: the one place its links and wording live, shared by the /podcast page and the crawler copy of it (middleware.js).
// The show is hosted on Spotify for Creators; Apple Podcasts and iHeart read the same feed. Nothing here claims a release schedule.
export const PODCAST = {
  name: 'The Memorabilia Kingdom Podcast',
  spotifyShow: 'https://open.spotify.com/show/3OYqLNzUSeG6XOyyitwLWN',
  spotifyEmbed: 'https://open.spotify.com/embed/show/3OYqLNzUSeG6XOyyitwLWN',
  apple: 'https://podcasts.apple.com/us/podcast/the-memorabilia-kingdom-podcast/id6826494805',
  iheart: 'https://www.iheart.com/podcast/269-the-memorabilia-kingdom-po-348343895/',
  pocketCasts: 'https://pocketcasts.com/podcast/the-memorabilia-kingdom-podcast/b39417d0-b208-013f-bb96-02fff6700f3f',
  youtube: 'https://www.youtube.com/@KingCredion',
  rss: 'https://anchor.fm/s/1190cdc34/podcast/rss',
  description: 'King Credion, Credabilia founder David Ortiz and his sister Hazel talk about the news in sports memorabilia and collectibles: record sales, rare cards, trivia, giveaways and the stories behind the gear.',
  // Same statement the show carries on Spotify, Apple Podcasts and iHeart, so the site and the show never disagree.
  aiNote: 'King Credion is an AI character. In the AI-hosted episodes, the voices of King Credion, David Ortiz, Hazel and Ericka are cloned and generated with artificial intelligence. In David’s Take, David appears as himself, in his real voice and on video.',
  seoDescription: 'The Memorabilia Kingdom Podcast: King Credion, founder David Ortiz and Hazel on sports memorabilia and collectibles news, rare cards, trivia and giveaways. Listen on Spotify, Apple Podcasts and iHeart.',
};

export const PODCAST_LISTEN_LINKS = [
  ['Spotify', PODCAST.spotifyShow],
  ['Apple Podcasts', PODCAST.apple],
  ['iHeart', PODCAST.iheart],
  ['Pocket Casts', PODCAST.pocketCasts],
  ['YouTube', PODCAST.youtube],
];

// ---- Episode pages (/podcast/<slug>) ----------------------------------------------------------------------------------------------------------------------------------
// Episodes come from the show's feed (supabase/functions/podcast-sync). Each one is either the morning "David's Take" (David on video, in his real voice) or an AI-hosted
// evening episode, and the page says which, so the voice statement is always true for the episode in front of the reader.
export const episodePath = slug => '/podcast/' + slug;

export const VOICE_NOTES = {
  davids_take: 'In David’s Take, David Ortiz speaks as himself, in his real voice. The short opening is voiced by King Credion, an AI character.',
  ai_hosted: 'This is an AI-hosted episode. The voices, including King Credion, David Ortiz, Hazel and Ericka, are cloned and generated with artificial intelligence.',
};
export const KIND_LABELS = { davids_take: 'David’s Take', ai_hosted: 'AI-hosted episode' };

export const formatDuration = seconds => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  const minutes = Math.max(1, Math.round(total / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
};
const isoDuration = seconds => {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return null;
  return `PT${total >= 3600 ? Math.floor(total / 3600) + 'H' : ''}${Math.floor((total % 3600) / 60)}M${total % 60}S`;
};
export const formatEpisodeDate = value => new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const paragraphsOf = text => String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

// Only what the page shows: the episode, its audio, its length and the sources listed on the page.
export function episodeJsonLd(episode, origin = 'https://credabilia.com') {
  const url = origin + episodePath(episode.slug);
  return {
    '@context': 'https://schema.org', '@type': 'PodcastEpisode', name: episode.title, url, datePublished: episode.published_at, dateModified: episode.updated_at || episode.published_at,
    description: episode.summary, inLanguage: 'en',
    partOfSeries: { '@type': 'PodcastSeries', name: PODCAST.name, url: origin + '/podcast' },
    ...(episode.image_url ? { image: episode.image_url } : {}),
    ...(episode.audio_url ? { associatedMedia: { '@type': 'AudioObject', contentUrl: episode.audio_url, encodingFormat: 'audio/mpeg', ...(isoDuration(episode.duration_seconds) ? { duration: isoDuration(episode.duration_seconds) } : {}) } } : {}),
    ...(episode.sources?.length ? { citation: episode.sources } : {}),
    publisher: { '@type': 'Organization', name: 'Credabilia', url: origin },
  };
}

// Structured data for search engines: the show, where it can be heard, and its feed.
export function podcastJsonLd(origin = 'https://credabilia.com') {
  return {
    '@context': 'https://schema.org', '@type': 'PodcastSeries', name: PODCAST.name, url: origin + '/podcast', description: PODCAST.description,
    webFeed: PODCAST.rss, publisher: { '@type': 'Organization', name: 'Credabilia', url: origin },
    sameAs: PODCAST_LISTEN_LINKS.map(([, href]) => href),
  };
}

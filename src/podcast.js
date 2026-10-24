// The Memorabilia Kingdom Podcast: the one place its links and wording live, shared by the /podcast page and the crawler copy of it (middleware.js).
// The show is hosted on Spotify for Creators; Apple Podcasts and iHeart read the same feed. Nothing here claims a release schedule.
export const PODCAST = {
  name: 'The Memorabilia Kingdom Podcast',
  spotifyShow: 'https://open.spotify.com/show/3OYqLNzUSeG6XOyyitwLWN',
  spotifyEmbed: 'https://open.spotify.com/embed/show/3OYqLNzUSeG6XOyyitwLWN',
  apple: 'https://podcasts.apple.com/us/podcast/the-memorabilia-kingdom-podcast/id6826494805',
  iheart: 'https://iheart.com/podcast/348343895/',
  rss: 'https://anchor.fm/s/1190cdc34/podcast/rss',
  description: 'King Credion, Credabilia founder David Ortiz and his sister Hazel talk about the news in sports memorabilia and collectibles: record sales, rare cards, trivia, giveaways and the stories behind the gear.',
  // Same statement the show carries on Spotify, Apple Podcasts and iHeart, so the site and the show never disagree.
  aiNote: 'King Credion is an AI character, and his voice, along with the voices of David Ortiz and Hazel, is generated with artificial intelligence.',
  seoDescription: 'The Memorabilia Kingdom Podcast: King Credion, founder David Ortiz and Hazel on sports memorabilia and collectibles news, rare cards, trivia and giveaways. Listen on Spotify, Apple Podcasts and iHeart.',
};

export const PODCAST_LISTEN_LINKS = [
  ['Spotify', PODCAST.spotifyShow],
  ['Apple Podcasts', PODCAST.apple],
  ['iHeart', PODCAST.iheart],
];

// Structured data for search engines: the show, where it can be heard, and its feed.
export function podcastJsonLd(origin = 'https://credabilia.com') {
  return {
    '@context': 'https://schema.org', '@type': 'PodcastSeries', name: PODCAST.name, url: origin + '/podcast', description: PODCAST.description,
    webFeed: PODCAST.rss, publisher: { '@type': 'Organization', name: 'Credabilia', url: origin },
    sameAs: [PODCAST.spotifyShow, PODCAST.apple, PODCAST.iheart],
  };
}

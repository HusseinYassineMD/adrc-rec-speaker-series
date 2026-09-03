/**
 * Shared data loading for dashboard + marketing pages.
 * Tries local JSON first, then falls back to the live GitHub Pages copy.
 */
(function () {
  const LIVE_SITE = 'https://husseinyassinemd.github.io/adrc-rec-speaker-series/';

  window.LIVE_SITE_URL = LIVE_SITE;

  window.fetchSpeakerJson = async function fetchSpeakerJson() {
    const urls = [
      'data/speakers.json',
      `${LIVE_SITE}data/speakers.json`,
    ];

    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastError = new Error(`Failed to load schedule data (${res.status}).`);
          continue;
        }
        return await res.json();
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Could not load schedule data. Check your internet connection.');
  };
})();

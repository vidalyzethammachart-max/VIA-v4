// Isolated origin, synthetic data only. Do not use for E2E acceptance.
localStorage.setItem('via-theme', 'light');
localStorage.setItem('via-language', 'th');
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin !== location.origin && url.hostname !== 'mcp.figma.com') {
    return Promise.reject(new Error('Fixture renderer blocks external application requests'));
  }
  if (url.pathname.startsWith('/api/')) return Promise.reject(new Error('Read-only Figma fixture'));
  return nativeFetch(input, init);
};
await import('../src/main');

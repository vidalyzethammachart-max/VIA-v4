function cleanTitle(value) {
  return typeof value === 'string'
    ? value.normalize('NFC').trim()
      .replace(/\.(pdf|docx)$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
      .replace(/[ .]+$/g, '')
    : '';
}

export function buildDocumentFilename(title, format, fallback = 'evaluation') {
  let name = cleanTitle(title) || cleanTitle(fallback) || 'evaluation';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  const encoder = new TextEncoder();
  let shortened = '';
  for (const character of name) {
    if (encoder.encode(shortened + character).length > 200) break;
    shortened += character;
  }
  return `${shortened.replace(/[ .]+$/g, '')}.${format}`;
}

export function buildDocumentDownloadUrl(signedUrl, title, format, fallback) {
  const url = new URL(signedUrl);
  // Supabase Storage sets Content-Disposition from this supported parameter.
  // An HTML download attribute alone is ignored for cross-origin file links.
  url.searchParams.set('download', buildDocumentFilename(title, format, fallback));
  return url.toString();
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Read-only UI fixture renderer. This config is never used by the app build.
export default defineConfig({
  root: process.cwd(),
  envDir: path.resolve('.figma-capture/no-env'),
  plugins: [
    { name: 'figma-fixture-data', enforce: 'pre', resolveId(id) {
      if (/\/lib\/supabaseClient(?:\.ts)?$/.test(id)) return path.resolve('.figma-capture/supabase.ts');
    }, transformIndexHtml(html) {
      return html.replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" src="/.figma-capture/main.ts"></script>')
        .replace('</body>', `<script>if(location.hash.includes('figmacapture=')){const s=document.createElement('script');s.src='https://mcp.figma.com/mcp/html-to-design/capture.js';s.async=true;document.head.appendChild(s);}</script></body>`);
    } },
    react(),
  ],
  server: { host: 'localhost', port: 5174, strictPort: true },
});

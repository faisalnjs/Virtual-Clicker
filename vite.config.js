import webfontDownload from 'vite-plugin-webfont-dl';
import version from 'vite-plugin-package-version';

export default defineConfig({
  plugins: [webfontDownload(), version()]
});

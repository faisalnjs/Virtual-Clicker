import webfontDownload from 'vite-plugin-webfont-dl';
import version from 'vite-plugin-package-version';

export default {
  plugins: [webfontDownload(), version()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        error: '404.html',
        resetcookies: 'resetcookies.html'
      }
    }
  }
};

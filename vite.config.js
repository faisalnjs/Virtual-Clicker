import { defineConfig } from 'vite';
import webfontDownload from 'vite-plugin-webfont-dl';
import version from 'vite-plugin-package-version';
import packageJSON from './package.json';

export default defineConfig({
  plugins: [webfontDownload(), version()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `[name]-[hash].js?v=${packageJSON.version}`,
        chunkFileNames: `[name]-[hash].js?v=${packageJSON.version}`,
        assetFileNames: `[name]-[hash].[ext]?v=${packageJSON.version}`
      }
    }
  }
});

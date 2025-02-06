import webfontDownload from "vite-plugin-webfont-dl";
import version from "vite-plugin-package-version";
const package = require('./package.json');

export default {
  plugins: [webfontDownload(), version()],
  build: {
    rollupOptions: {
      output: {
          entryFileNames: `[name]-[hash].[format]?v=${package.version}`,
          chunkFileNames: `[name]-[hash].[format]?v=${package.version}`,
          assetFileNames: `[name]-[hash].[ext]?v=${package.version}`
      }
    }
  }
};

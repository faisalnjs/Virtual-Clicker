import webfontDownload from "vite-plugin-webfont-dl";
import version from "vite-plugin-package-version";
const packageJSON = require('./package.json');

export default {
  plugins: [webfontDownload(), version()],
  build: {
    rollupOptions: {
      output: {
          entryFileNames: `[name]-[hash].[format]?v=${packageJSON.version}`,
          chunkFileNames: `[name]-[hash].[format]?v=${packageJSON.version}`,
          assetFileNames: `[name]-[hash].[ext]?v=${packageJSON.version}`
      }
    }
  }
};

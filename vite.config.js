import webfontDownload from "vite-plugin-webfont-dl";
import version from "vite-plugin-package-version";
const packageJson = require('./package.json');
const version = packageJson.version;

export default {
  plugins: [webfontDownload(), version()],
  build: {
    rollupOptions: {
      output: {
          entryFileNames: `[name]-[hash].[format]?v=${version().version}`,
          chunkFileNames: `[name]-[hash].[format]?v=${version().version}`,
          assetFileNames: `[name]-[hash].[ext]?v=${version().version}`
      }
    }
  }
};

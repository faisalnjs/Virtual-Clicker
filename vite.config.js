import webfontDownload from "vite-plugin-webfont-dl";
import version from "vite-plugin-package-version";

export default {
  plugins: [webfontDownload(), version()],
  build: {
    rollupOptions: {
      output: {
          entryFileNames: `[name].js?v=${version().version}`,
          chunkFileNames: `[name].js?v=${version().version}`,
          assetFileNames: `[name].[ext]?v=${version().version}`
      }
    }
  }
};

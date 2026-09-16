import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue(), {
    name: 'refresh-shared-ui',
    handleHotUpdate({ file, server }) {
      const path = file.replace(/\\/g, '/');
      // Reload shared locale state and shell structure together.
      if (/\/src\/(i18n\.ts|locales\/[^/]+\.ts|pages\/FamilyLayout\.vue|components\/PageHeading\.vue)$/.test(path)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  }],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9058',
        changeOrigin: true,
      },
    },
  },
});

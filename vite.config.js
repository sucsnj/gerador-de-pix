import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT) || 5173;

  return {
    server: {
      host: true,
      port,
      strictPort: true,
    },
    build: {
      target: 'es2018',
      outDir: 'dist',
    },
  };
});
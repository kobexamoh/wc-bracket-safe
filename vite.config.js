import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vite only serves the static app. /api/* is Vercel serverless — proxy it in dev
  // so login-help Slack alerts work on localhost (needs http://localhost:3000 in
  // NOTIFY_ALLOWED_ORIGINS on the target Vercel project).
  const env = loadEnv(mode, process.cwd(), '');
  const notifyProxyTarget = env.VITE_NOTIFY_PROXY_TARGET || 'https://wc.kobexamoh.me';

  return {
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: notifyProxyTarget,
          // Rewrite Host to the Vercel deployment; browser Origin stays localhost for CORS.
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      minify: 'esbuild',
    },
  };
});

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_N8N_WEBHOOK_URL = "https://vidalyze.app.n8n.cloud/webhook/google-form-hook"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["N8N_WEBHOOK_URL"])
  const webhookUrl = env.N8N_WEBHOOK_URL || DEFAULT_N8N_WEBHOOK_URL
  const parsedWebhookUrl = webhookUrl ? new URL(webhookUrl) : null

  return {
    plugins: [react()],
    envPrefix: ["VITE_", "N8N_WEBHOOK_URL"],
    base: '/',
    server: parsedWebhookUrl
      ? {
          proxy: {
            "/api/n8n-webhook": {
              target: parsedWebhookUrl.origin,
              changeOrigin: true,
              secure: true,
              rewrite: () => `${parsedWebhookUrl.pathname}${parsedWebhookUrl.search}`,
            },
          },
        }
      : undefined,
  }
})

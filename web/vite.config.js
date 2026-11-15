import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// In local dev, serve /api/ask with the same handler Vercel runs in production.
function apiDev() {
  return {
    name: 'ember-api-dev',
    configureServer(server) {
      for (const name of ['ask', 'agent']) server.middlewares.use('/api/' + name, async (req, res) => {
        const cwd = process.cwd()
        process.chdir(path.resolve(__dirname, '..'))
        try {
          const mod = await server.ssrLoadModule(path.resolve(__dirname, `../api/${name}.js`))
          await mod.default(req, res)
        } finally { process.chdir(cwd) }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, path.resolve(__dirname, '..'), ''))
  return { plugins: [react(), apiDev()], build: { chunkSizeWarningLimit: 1500 } }
})

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// In local dev, serve /api/ask with the same handler Vercel runs in production.
function apiDev() {
  return {
    name: 'ember-api-dev',
    configureServer(server) {
      for (const name of ['ask', 'agent', 'live']) server.middlewares.use('/api/' + name, async (req, res) => {
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
  // __BUILD__ busts the browser cache for the machine pages in public/ (they are not hashed by Vite)
  return { plugins: [react(), apiDev()], define: { __BUILD__: JSON.stringify(Date.now().toString(36)) }, build: { chunkSizeWarningLimit: 1500 } }
})

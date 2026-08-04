import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Serves the public landing page at /home while developing.
 *
 * In production Express owns that route (see server/index.js). The dev server
 * does not: Vite's SPA fallback answers any unknown path with index.html, so
 * /home quietly returned the app's login screen and the landing page looked
 * broken on localhost while being perfectly fine once deployed — the worst kind
 * of difference between the two.
 *
 * The file is located from Vite's own resolved publicDir rather than from
 * __dirname, which does not exist here: this package is "type": "module", so
 * the config is an ES module and referencing __dirname throws while the config
 * loads — which stops the dev server binding at all.
 */
function landingPage() {
    return {
        name: 'vgtc-landing-page',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = (req.url || '').split('?')[0]
                if (url !== '/home' && url !== '/home/') return next()
                const file = path.join(server.config.publicDir, 'home.html')
                if (!fs.existsSync(file)) return next()
                res.setHeader('Content-Type', 'text/html; charset=utf-8')
                res.end(fs.readFileSync(file))
            })
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), landingPage()],
    server: {
        host: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:5000',
                changeOrigin: true,
            },
        },
    }
})

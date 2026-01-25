import { defineConfig } from '@adonisjs/cors'

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://abbynbev.com',
  'https://abbynbev.com',
  'http://simako.abbynbev.com',
  'https://simako.abbynbev.com',
])

export default defineConfig({
  enabled: true,

  // ✅ lebih robust: handle origin dinamis (misal preview/staging),
  // tetap aman karena only allow yang whitelist.
  origin: (origin) => {
    // allow non-browser clients / server-to-server / curl
    if (!origin) return true

    // allow exact match
    if (allowedOrigins.has(origin)) return true

    // optional: allow any subdomain *.abbynbev.com
    try {
      const url = new URL(origin)
      if (url.hostname.endsWith('.abbynbev.com')) return true
    } catch {}

    return false
  },

  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  // ✅ lebih eksplisit (headers: true itu ok, tapi ini lebih predictable)
  headers: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-HTTP-Method-Override',
    'Content-Disposition',
  ],

  // exposeHeaders "Set-Cookie" sebenarnya gak kepake di browser JS,
  // tapi gak masalah dibiarkan
  exposeHeaders: ['Content-Type', 'Content-Length', 'X-Total-Count', 'Content-Disposition'],

  maxAge: 90,
})

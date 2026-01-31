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
  enabled: true, // DISABLED UNTUK STAGING - ENABLE LAGI SETELAH STAGING

  // ✅ lebih robust: handle origin dinamis (misal preview/staging),
  // tetap aman karena only allow yang whitelist.
  origin: (origin) => {
    // allow non-browser clients / server-to-server / curl
    if (!origin) return true

    // allow exact match
    if (allowedOrigins.has(origin)) return true

    // optional: allow verified subdomains *.abbynbev.com (prevent bypass)
    try {
      const url = new URL(origin)
      const hostname = url.hostname
      // Ensure it's exactly a subdomain, not a suffix bypass
      if (hostname === 'abbynbev.com' || 
          (hostname.endsWith('.abbynbev.com') && 
           hostname.split('.').length >= 2 &&
           !hostname.includes('..') &&
           /^[a-zA-Z0-9-]+\.abbynbev\.com$/.test(hostname))) {
        return true
      }
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

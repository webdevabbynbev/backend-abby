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
  // ✅ WAJIB true biar browser gak nge-block request FE -> BE
  enabled: true,

  // ✅ whitelist origin yang aman
  origin: (origin) => {
    // allow non-browser clients / server-to-server / curl
    if (!origin) return true

    // allow exact match
    if (allowedOrigins.has(origin)) return true

    // optional: allow verified subdomains *.abbynbev.com (prevent bypass)
    try {
      const url = new URL(origin)
      const hostname = url.hostname

      if (
        hostname === 'abbynbev.com' ||
        (hostname.endsWith('.abbynbev.com') &&
          hostname.split('.').length >= 2 &&
          !hostname.includes('..') &&
          /^[a-zA-Z0-9-]+\.abbynbev\.com$/.test(hostname))
      ) {
        return true
      }
    } catch {}

    return false
  },

  // ✅ kamu pakai Bearer token (Authorization header), bukan cookie session
  credentials: false,

  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // ✅ penting: Authorization harus di-allow supaya preflight lolos
  headers: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-HTTP-Method-Override',
    'Content-Disposition',
  ],

  exposeHeaders: ['Content-Type', 'Content-Length', 'X-Total-Count', 'Content-Disposition'],

  maxAge: 90,
})

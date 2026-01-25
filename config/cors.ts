import { defineConfig } from '@adonisjs/cors'

export default defineConfig({
  enabled: true,
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://abbynbev.com',
    'https://abbynbev.com',
    'http://simako.abbynbev.com',
    'https://simako.abbynbev.com',
    'https://abby-stagging.up.railway.app',
    'https://backend-abby-stagging.up.railway.app',

  ],
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  headers: true,
  exposeHeaders: ['Content-Type', 'Content-Length', 'X-Total-Count', 'Set-Cookie'],
  maxAge: 90,
})
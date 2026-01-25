import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

type Product = {
  id?: string | number
  name: string
  price?: number | string
  url?: string
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text

  const parts: string[] = []
  const outputs = Array.isArray(data?.output) ? data.output : []
  for (const o of outputs) {
    const contents = Array.isArray(o?.content) ? o.content : []
    for (const c of contents) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') parts.push(c.text)
      if (!c?.type && typeof c?.text === 'string') parts.push(c.text)
    }
  }
  return parts.join('\n').trim()
}

async function fetchCatalogProducts(q: string): Promise<Product[]> {
  // Ambil dari API kamu sendiri (yang sudah bisa akses DB)
  // Pastikan endpoint ini PUBLIC/allowed dari backend kamu, atau pakai internal network.
  const base = env.get('CATALOG_API_BASE') // contoh: https://backend-abby-stagging.up.railway.app
  const token = env.get('CATALOG_API_TOKEN') // optional kalau endpoint kamu butuh auth

  if (!base) return []

  const url = `${String(base).replace(/\/+$/, '')}/api/v1/products/search?q=${encodeURIComponent(q)}&limit=6`

  const r = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeout: 15000,
  })

  const rows = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data?.serve?.data) ? r.data.serve.data : []
  return rows
    .map((p: any) => ({
      id: p?.id,
      name: p?.name ?? p?.title ?? '',
      price: p?.price ?? p?.sale_price ?? p?.final_price,
      url: p?.url ?? p?.link ?? (p?.slug ? `/product/${p.slug}` : undefined),
    }))
    .filter((p: Product) => p.name)
    .slice(0, 6)
}

export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      const sessionId = String(request.input('session_id') || '').trim()
      const previousResponseId = String(request.input('previous_response_id') || '').trim() || undefined

      if (!message) {
        return response.status(400).send({ message: 'message is required', serve: null })
      }
      if (!sessionId) {
        return response.status(400).send({ message: 'session_id is required', serve: null })
      }

      const model = env.get('OPENAI_MODEL') || 'gpt-4.1-mini'
      const apiKey = env.get('OPENAI_API_KEY')
      if (!apiKey) {
        return response.status(500).send({ message: 'OPENAI_API_KEY not set', serve: null })
      }

      // 1) Ambil produk dari DB (via API kamu)
      const products = await fetchCatalogProducts(message)

      // 2) Paksa format keluaran (biar konsisten di turn 2, 3, dst)
      // IMPORTANT: karena instructions tidak kebawa otomatis ke request berikutnya,
      // kita kirim instructions SETIAP request. :contentReference[oaicite:5]{index=5}
      const instructions = `
Kamu adalah "Abby n Bev AI" (Beauty Assistant toko Abby n Bev).
Selalu jawab dalam Bahasa Indonesia, tone ramah, konsisten.

WAJIB format output seperti ini (gunakan heading persis):
REKOMENDASI
- <Nama Produk> — <Harga> — <alasan singkat 1 kalimat>
(beri 3–6 item. Kalau produk kosong, tulis: "Belum ada produk yang cocok di katalog saat ini.")

TIPS
- (2–4 poin singkat)

PERTANYAAN LANJUTAN
- (1 pertanyaan untuk memperjelas kebutuhan)

Aturan penting:
- Jangan rekomendasikan produk di luar daftar "KATALOG" yang aku berikan.
- Jangan ganti bahasa selain Indonesia.
- Jangan jawab "Hello how can I assist..." atau template generik.

KATALOG (JSON):
${JSON.stringify(products, null, 2)}
      `.trim()

      // 3) Call OpenAI Responses dengan session continuity via previous_response_id
      // previous_response_id mempertahankan konteks percakapan. :contentReference[oaicite:6]{index=6}
      const payload: any = {
        model,
        instructions,
        input: message,
      }
      if (previousResponseId) payload.previous_response_id = previousResponseId

      const r = await axios.post('https://api.openai.com/v1/responses', payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })

      const outputText = extractOutputText(r.data)
      const newResponseId = r.data?.id // dipakai sebagai previous_response_id next turn

      return response.status(200).send({
        output_text: outputText || 'Maaf, aku belum dapat jawaban. Coba ulangi ya.',
        previous_response_id: newResponseId,
        serve: null,
      })
    } catch (error: any) {
      const msg = error?.response?.data || error?.message || 'Server error'
      console.error(msg)
      return response.status(500).send({ message: msg, serve: null })
    }
  }
}

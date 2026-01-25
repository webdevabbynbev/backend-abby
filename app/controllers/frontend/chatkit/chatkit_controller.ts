import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

async function searchCatalogProducts(query: string) {
  const base = env.get('CATALOG_BASE_URL') // contoh: https://backend-abby-stagging.up.railway.app
  if (!base) return []

  // Sesuaikan endpoint search yang benar di backend kamu
  const url =
    `${base.replace(/\/+$/, '')}` +
    `/api/v1/products/search?q=${encodeURIComponent(query)}&limit=8`

  const r = await axios.get(url, { timeout: 15000 })

  // Sesuaikan bentuk response API kamu
  const data = r.data?.serve?.data || r.data?.data || r.data?.serve || []
  return Array.isArray(data) ? data : []
}

function pickCatalogFields(p: any) {
  const price = p?.price ?? p?.final_price ?? p?.selling_price ?? p?.sale_price ?? null
  const name = p?.name ?? p?.title ?? ''
  const slug = p?.slug ?? p?.path ?? null

  return {
    id: p?.id ?? null,
    name: String(name || ''),
    price: typeof price === 'number' ? price : Number(price) || null,
    currency: 'IDR',
    slug: slug ? String(slug) : null,
    url: slug ? `/products/${slug}` : null,
    brand: p?.brand?.name ?? p?.brand_name ?? null,
  }
}

function safeStringify(x: any) {
  try {
    return JSON.stringify(x)
  } catch {
    return '[]'
  }
}

export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      if (!message) {
        return response.status(400).send({ message: 'Message is required', serve: null })
      }

      const sessionId = String(request.input('session_id') || '').trim() || 'anon'
      const workflowId = env.get('CHATKIT_WORKFLOW_ID')
      if (!workflowId) {
        return response.status(500).send({ message: 'CHATKIT_WORKFLOW_ID is not set', serve: null })
      }

      // 1) ambil produk kandidat dari katalog (berdasarkan message)
      const rawProducts = await searchCatalogProducts(message)
      const products = rawProducts.slice(0, 8).map(pickCatalogFields)

      // 2) kirim ke workflow sebagai konteks + instruksi format output terstruktur
      const inputText =
        [
          `USER_MESSAGE: ${message}`,
          ``,
          `CATALOG_PRODUCTS(JSON):`,
          safeStringify(products),
          ``,
          `INSTRUCTIONS (WAJIB DIIKUTI):`,
          `- Jawab dalam Bahasa Indonesia.`,
          `- Jangan mengarang nama produk atau harga. Gunakan hanya dari CATALOG_PRODUCTS.`,
          `- Format jawaban HARUS terstruktur dengan urutan berikut:`,
          `  1) "Rekomendasi yang cocok" (bullet list 3-6 item).`,
          `     Tiap item: Nama — Harga (IDR) — alasan singkat.`,
          `  2) "Tips pemakaian" (3 bullet).`,
          `  3) "Pertanyaan lanjutan" (1-2 pertanyaan singkat).`,
          `- Kalau CATALOG_PRODUCTS kosong: jelaskan tidak menemukan produk yang cocok, lalu beri tips umum + tanyakan preferensi.`,
        ].join('\n')

      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          workflow: { id: workflowId }, // ✅ pakai training platform kamu
          user: sessionId,
          input: inputText,
        },
        {
          headers: {
            Authorization: `Bearer ${env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )

      // 3) ambil output text
      const outputText =
        (typeof r.data?.output_text === 'string' && r.data.output_text) ||
        (typeof r.data?.output?.[0]?.content?.[0]?.text === 'string' && r.data.output[0].content[0].text) ||
        ''

      return response.status(200).send({
        output_text: outputText || 'Maaf, aku belum dapat jawaban. Coba ulangi ya.',
        serve: null,
      })
    } catch (error: any) {
      const payload = error?.response?.data || error?.message || 'Unknown error'
      console.error(payload)
      return response.status(500).send({
        message: typeof payload === 'string' ? payload : JSON.stringify(payload),
        serve: null,
      })
    }
  }
}

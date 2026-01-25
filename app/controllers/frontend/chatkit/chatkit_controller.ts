import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

type HistoryItem = { role: 'user' | 'assistant' | 'system'; content: string }

function normalizeHistory(raw: any): HistoryItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => ({
      role: (x?.role === 'assistant' || x?.role === 'system') ? x.role : 'user',
      content: String(x?.content ?? '').trim(),
    }))
    .filter((x) => x.content.length > 0)
    .slice(-12) // batasi biar tidak kepanjangan
}

function pickCatalogFields(p: any) {
  const price = p?.price ?? p?.final_price ?? p?.selling_price ?? p?.sale_price ?? null
  const name = p?.name ?? p?.title ?? ''
  const slug = p?.slug ?? p?.path ?? null

  return {
    id: p?.id ?? null,
    name: String(name || ''),
    price: typeof price === 'number' ? price : (price ? Number(price) : null),
    currency: 'IDR',
    slug: slug ? String(slug) : null,
    brand: p?.brand?.name ?? p?.brand_name ?? null,
  }
}

async function searchCatalogProducts(query: string) {
  const base = env.get('CATALOG_BASE_URL') // contoh: https://backend-abby-stagging.up.railway.app
  if (!base) return []

  const url =
    `${base.replace(/\/+$/, '')}` +
    `/api/v1/products/search?q=${encodeURIComponent(query)}&limit=8`

  try {
    const r = await axios.get(url, { timeout: 15000 })

    // Sesuaikan sesuai bentuk response API kamu:
    const data = r.data?.serve?.data || r.data?.data || r.data?.serve || []
    return Array.isArray(data) ? data : []
  } catch (err: any) {
    // ✅ KUNCI: product not found jangan bikin chat gagal
    const status = err?.response?.status
    const msg =
      (typeof err?.response?.data?.message === 'string' && err.response.data.message) ||
      (typeof err?.response?.data === 'string' && err.response.data) ||
      err?.message ||
      ''

    const low = String(msg).toLowerCase()

    if (status === 404 || low.includes('product not found') || low.includes('not found')) {
      return []
    }

    // error lain: tetap jangan bikin fatal, log saja
    console.error('[catalog search error]', status, msg)
    return []
  }
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text

  const parts: string[] = []
  const outputs = Array.isArray(data?.output) ? data.output : []

  for (const o of outputs) {
    const contents = Array.isArray(o?.content) ? o.content : []
    for (const c of contents) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') parts.push(c.text)
      if (!c?.type && typeof c?.text === 'string') parts.push(c.text) // fallback
    }
  }

  return parts.join('\n').trim()
}

export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      if (!message) {
        return response.status(400).send({ message: 'Message is required', serve: null })
      }

      const sessionId = String(request.input('session_id') || '').trim() || 'anon'
      const history = normalizeHistory(request.input('history'))

      const workflowId = env.get('CHATKIT_WORKFLOW_ID')
      if (!workflowId) {
        return response.status(500).send({ message: 'CHATKIT_WORKFLOW_ID is not set', serve: null })
      }

      // 1) cari produk berdasarkan message
      const rawProducts = await searchCatalogProducts(message)
      const products = rawProducts.slice(0, 8).map(pickCatalogFields)

      // 2) susun input percakapan + konteks katalog + aturan format
      const formattedCatalogBlock =
        [
          `CATALOG_PRODUCTS(JSON):`,
          JSON.stringify(products),
          ``,
          `FORMAT WAJIB (urutan):`,
          `1) Rekomendasi yang cocok (3-6 bullet)`,
          `   - Nama — Harga (IDR) — alasan singkat`,
          `2) Tips pemakaian (3 bullet)`,
          `3) Pertanyaan lanjutan (1-2 pertanyaan)`,
          `ATURAN:`,
          `- Jangan mengarang produk/harga di luar CATALOG_PRODUCTS.`,
          `- Jika CATALOG_PRODUCTS kosong: bilang tidak menemukan produk di katalog, lalu minta preferensi (budget/brand/masalah kulit), tetap beri tips umum.`,
        ].join('\n')

      // input untuk Responses API bisa berupa array message
      const inputMessages = [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        {
          role: 'user' as const,
          content: `${message}\n\n${formattedCatalogBlock}`,
        },
      ]

      // 3) panggil workflow (ini yang sinkron dengan training platform kamu)
      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          workflow: { id: workflowId },
          user: sessionId,
          input: inputMessages,
        },
        {
          headers: {
            Authorization: `Bearer ${env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )

      const outputText = extractOutputText(r.data)

      return response.status(200).send({
        output_text: outputText || 'Maaf, aku belum dapat jawaban. Coba ulangi ya.',
        serve: null,
      })
    } catch (error: any) {
      const payload = error?.response?.data || error?.message || 'Unknown error'
      console.error('[chatkit error]', payload)

      // ✅ jangan stringify ganda, kirim string yang rapi
      const message =
        typeof payload === 'string' ? payload : JSON.stringify(payload)

      return response.status(500).send({ message, serve: null })
    }
  }
}

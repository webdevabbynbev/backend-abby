import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

/* ============================================================================
 * Types
 * ============================================================================ */
type Product = {
  id?: string | number
  name: string
  price?: number | string
  url?: string
}

/* ============================================================================
 * Utils
 * ============================================================================ */

// intent sederhana dulu (nanti bisa di-extend ke mapping tag)
function detectIntent(text: string): 'greeting' | 'recommendation' | 'other' {
  const t = text.toLowerCase().trim()

  // 1. Greeting / basa-basi
  if (/^(hai|halo|hello|hi|pagi|siang|sore|malam)\b/.test(t)) {
    return 'greeting'
  }

  // 2. Explicit recommendation intent
  if (/(rekomendasikan|sarankan|rekomendasiin|rekomendasi produk|produk apa|pakai apa)/i.test(t)) {
    return 'recommendation'
  }

  return 'other'
}

function extractSearchKeyword(text: string): string {
  const t = text.toLowerCase()

  if (/facewash|facial wash|cleanser/.test(t)) return 'facewash'
  if (/kulit kering|kering/.test(t)) return 'kering'
  if (/kulit sensitif|sensitif/.test(t)) return 'sensitif'
  if (/kulit berminyak|berminyak/.test(t)) return 'berminyak'
  if (/acne|jerawat/.test(t)) return 'jerawat'

  return ''
}

// extractor output yang BENAR untuk Responses API
function extractOutputText(data: any): string {
  if (!data) return ''

  // Case 1: output_text langsung (kadang ada)
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text
  }

  // Case 2: output array (PALING SERING)
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c?.type === 'output_text' && typeof c.text === 'string') {
            return c.text
          }
        }
      }
    }
  }

  // Case 3: fallback keras (DEBUG)
  return '[AI tidak mengembalikan teks]'
}

/* ============================================================================
 * Catalog fetch (AMAN, tidak bikin error)
 * ============================================================================ */
async function fetchCatalogProducts(query: string): Promise<Product[]> {
  const base = env.get('CATALOG_API_BASE')
  if (!base) return []

  try {
    const url =
      `${String(base).replace(/\/+$/, '')}` +
      `/api/v1/products/search?q=${encodeURIComponent(query)}&limit=6`

    const res = await axios.get(url, { timeout: 10000 })

    const rows = Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data?.serve?.data)
        ? res.data.serve.data
        : []

    return rows
      .map((p: any) => ({
        id: p?.id,
        name: p?.name ?? p?.title ?? '',
        price: p?.price ?? p?.sale_price ?? p?.final_price,
        url: p?.slug ? `/products/${p.slug}` : undefined,
      }))
      .filter((p: Product) => p.name)
      .slice(0, 6)
  } catch (err: any) {
    console.warn('[CATALOG FALLBACK]', err?.message)
    return []
  }
}

/* ============================================================================
 * Prompt
 * ============================================================================ */

const INSTRUCTIONS = `

Kamu adalah Abby n Bev AI, beauty assistant toko.

GAYA BICARA:
- Ramah
- Natural
- Seperti beauty advisor

ATURAN PENTING:
- Jika user menyapa (hai, halo, hello): balas ramah, JANGAN rekomendasi produk
- Jika user minta rekomendasi produk:
  - LANGSUNG tampilkan daftar produk dari KATALOG
  - JANGAN jawab panjang dulu
  - JANGAN bertanya sebelum menampilkan produk

FORMAT WAJIB JIKA ADA PRODUK:

REKOMENDASI
- <Nama Produk> — <Harga> — <alasan singkat>

TIPS
- (maks 2 poin singkat)

PERTANYAAN LANJUTAN
- (1 pertanyaan ringan)

Jika KATALOG kosong:
- Tetap jawab ramah
- Beri edukasi singkat
- Jangan bilang "produk tidak ditemukan"

Jika user hanya menyapa (contoh: hai, halo):
- Balas dengan ramah
- Jangan langsung merekomendasikan produk
- Tanyakan kebutuhan user terlebih dahulu

`.trim()

/* ============================================================================
 * Controller
 * ============================================================================ */
export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      const sessionId = String(request.input('session_id') || '').trim()
      const previousResponseId =
        String(request.input('previous_response_id') || '').trim() || undefined

      if (!message || !sessionId) {
        return response.status(400).send({ message: 'Invalid request' })
      }

      const apiKey = env.get('OPENAI_API_KEY')
      if (!apiKey) {
        return response.status(500).send({ message: 'OPENAI_API_KEY missing' })
      }

      const model = env.get('OPENAI_MODEL') || 'gpt-4.1-mini'

      /* ------------------------------------------------------------------ */
      /* Ambil produk jika intent produk                                    */
      /* ------------------------------------------------------------------ */
      const intent = detectIntent(message)

      // ============================
      // 1. GREETING → BALAS LANGSUNG
      // ============================
      if (intent === 'greeting') {
        return response.ok({
          output_text:
            'Hai bestie! 💖 Aku Abby n Bev AI. Mau cari rekomendasi skincare, makeup, atau mau konsultasi dulu soal kondisi kulit kamu?',
          previous_response_id: previousResponseId ?? null,
          serve: { products: [] },
        })
      }

      let products: Product[] = []

      if (intent === 'recommendation') {
        const keyword = extractSearchKeyword(message)

        if (keyword) {
          products = await fetchCatalogProducts(keyword)
        }
      }

      /* ------------------------------------------------------------------ */
      /* Bangun input ke AI (STRING → masuk ke input_text)                  */
      /* ------------------------------------------------------------------ */
      const aiInput = `
USER:
${message}

KATALOG:
${JSON.stringify(products, null, 2)}
`.trim()

      /* ------------------------------------------------------------------ */
      /* Payload Responses API (FORMAT BENAR)                               */
      /* ------------------------------------------------------------------ */
      const payload: any = {
        model,
        instructions: INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: aiInput,
              },
            ],
          },
        ],
      }

      if (previousResponseId) {
        payload.previous_response_id = previousResponseId
      }

      const r = await axios.post('https://api.openai.com/v1/responses', payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })

      const outputText =
        extractOutputText(r.data) ||
        'Hai bestie! Aku Abby n Bev AI 💖 Mau cari rekomendasi skincare atau makeup apa hari ini?'

      return response.status(200).send({
        output_text: extractOutputText(r.data),
        previous_response_id: r.data.id,
        serve: {
          products,
        },
      })
    } catch (err: any) {
      console.error('[CHATKIT FATAL]', err?.message, err?.response?.data || err)
      return response.status(500).send({
        message: 'Maaf bestie, sistem lagi sibuk. Coba lagi sebentar ya 💖',
      })
    }
  }
}

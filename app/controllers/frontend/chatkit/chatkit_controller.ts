import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
type Product = {
  id?: string | number
  name: string
  price?: number | string
  url?: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text
  }

  const parts: string[] = []
  const outputs = Array.isArray(data?.output) ? data.output : []

  for (const o of outputs) {
    const contents = Array.isArray(o?.content) ? o.content : []
    for (const c of contents) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') {
        parts.push(c.text)
      }
      if (!c?.type && typeof c?.text === 'string') {
        parts.push(c.text)
      }
    }
  }

  return parts.join('\n').trim()
}

function getToolCall(data: any) {
  const outputs = Array.isArray(data?.output) ? data.output : []
  return outputs.find((o: any) => o.type === 'tool_call')
}

/* -------------------------------------------------------------------------- */
/* Catalog fetch (existing DB / API)                                           */
/* -------------------------------------------------------------------------- */
async function fetchCatalogProducts(q: string): Promise<Product[]> {
  const base = env.get('CATALOG_API_BASE')
  const token = env.get('CATALOG_API_TOKEN')

  if (!base) return []

  const url =
    `${String(base).replace(/\/+$/, '')}` +
    `/api/v1/products/search?q=${encodeURIComponent(q)}&limit=6`

  const r = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeout: 15000,
  })

  const rows = Array.isArray(r.data?.data)
    ? r.data.data
    : Array.isArray(r.data?.serve?.data)
    ? r.data.serve.data
    : []

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

/* -------------------------------------------------------------------------- */
/* OpenAI config                                                               */
/* -------------------------------------------------------------------------- */
const BASE_INSTRUCTIONS = `
Kamu adalah "Abby n Bev AI" (Beauty Assistant).

Aturan umum:
- Selalu jawab dalam Bahasa Indonesia
- Tone ramah dan konsisten
- Jangan menyebut sistem, tool, API, atau proses internal

Jika kamu membutuhkan produk untuk menjawab:
- Panggil tool "search_products"

Jika kamu menerima data dari tool:
- Gunakan HANYA data tersebut
- Jangan menambah atau mengarang produk

FORMAT WAJIB JAWABAN AKHIR:

REKOMENDASI
- <Nama Produk> — <Harga> — <alasan singkat>

TIPS
- (2–4 poin)

PERTANYAAN LANJUTAN
- (1 pertanyaan)

Jika tidak ada produk yang relevan:
- Di bagian REKOMENDASI tulis:
  "Belum ada produk yang cocok di katalog saat ini."
`.trim()

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Cari produk Abby n Bev dari katalog internal',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Ringkasan kebutuhan user',
          },
        },
        required: ['query'],
      },
    },
  },
]

/* -------------------------------------------------------------------------- */
/* Controller                                                                  */
/* -------------------------------------------------------------------------- */
export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      const sessionId = String(request.input('session_id') || '').trim()
      const previousResponseId =
        String(request.input('previous_response_id') || '').trim() || undefined

      if (!message) {
        return response.status(400).send({ message: 'message is required' })
      }

      if (!sessionId) {
        return response.status(400).send({ message: 'session_id is required' })
      }

      const apiKey = env.get('OPENAI_API_KEY')
      if (!apiKey) {
        return response.status(500).send({ message: 'OPENAI_API_KEY not set' })
      }

      const model = env.get('OPENAI_MODEL') || 'gpt-4.1-mini'

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }

      /* ------------------------------------------------------------------ */
      /* STEP 1 — Decision step (model decides tool or not)                  */
      /* ------------------------------------------------------------------ */
      const firstPayload: any = {
        model,
        input: message,
        instructions: BASE_INSTRUCTIONS,
        tools: TOOLS,
      }

      if (previousResponseId) {
        firstPayload.previous_response_id = previousResponseId
      }

      const firstResponse = await axios.post(
        'https://api.openai.com/v1/responses',
        firstPayload,
        { headers, timeout: 30000 }
      )

      const toolCall = getToolCall(firstResponse.data)

      /* ------------------------------------------------------------------ */
      /* STEP 2A — Tool called (fetch catalog, then final answer)            */
      /* ------------------------------------------------------------------ */
      if (toolCall?.name === 'search_products') {
        const query = toolCall.arguments?.query || message

        const products = await fetchCatalogProducts(query)

        const secondPayload: any = {
          model,
          instructions: BASE_INSTRUCTIONS,
          previous_response_id: firstResponse.data.id,
          input: [
            {
              role: 'tool',
              name: 'search_products',
              content: JSON.stringify(products),
            },
          ],
        }

        const finalResponse = await axios.post(
          'https://api.openai.com/v1/responses',
          secondPayload,
          { headers, timeout: 30000 }
        )

        return response.status(200).send({
          output_text:
            extractOutputText(finalResponse.data) ||
            'Maaf, aku belum menemukan jawaban yang pas.',
          previous_response_id: finalResponse.data.id,
          serve: null,
        })
      }

      /* ------------------------------------------------------------------ */
      /* STEP 2B — No tool needed (direct answer)                            */
      /* ------------------------------------------------------------------ */
      return response.status(200).send({
        output_text:
          extractOutputText(firstResponse.data) ||
          'Maaf, aku belum menemukan jawaban yang pas.',
        previous_response_id: firstResponse.data.id,
        serve: null,
      })
    } catch (error: any) {
      const msg = error?.response?.data || error?.message || 'Server error'
      console.error('[CHATKIT ERROR]', msg)
      return response.status(500).send({ message: msg })
    }
  }
}

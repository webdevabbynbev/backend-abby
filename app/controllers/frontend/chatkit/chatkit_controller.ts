import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

function extractOutputText(data: any): string {
  // 1) kalau ada output_text langsung pakai
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text
  }

  // 2) flatten output[].content[] dan ambil hanya output_text
  const parts: string[] = []
  const outputs = Array.isArray(data?.output) ? data.output : []

  for (const o of outputs) {
    const contents = Array.isArray(o?.content) ? o.content : []
    for (const c of contents) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') {
        parts.push(c.text)
      }
      // beberapa bentuk bisa pakai {type:"text"} (jaga-jaga)
      if (!c?.type && typeof c?.text === 'string') {
        parts.push(c.text)
      }
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

      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: 'gpt-4.1-mini',
          input: message,
          // optional: paksa output murni teks
          // text: { format: { type: 'text' } },
        },
        {
          headers: {
            Authorization: `Bearer ${env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const outputText = extractOutputText(r.data)

      return response.status(200).send({
        output_text: outputText || 'Maaf, aku belum dapat jawaban. Coba ulangi ya.',
        serve: null,
      })
    } catch (error: any) {
      console.error(error?.response?.data || error?.message)
      return response.status(500).send({
        message: error?.response?.data || error?.message,
        serve: null,
      })
    }
  }
}

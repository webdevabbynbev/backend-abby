import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string }

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
      } else if (typeof c?.text === 'string') {
        // fallback kalau bentuknya beda
        parts.push(c.text)
      }
    }
  }

  return parts.join('\n').trim()
}

function sanitizeHistory(raw: any): ChatMsg[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: ChatMsg[] = []

  for (const item of arr.slice(-12)) {
    const role = item?.role
    const content = item?.content

    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content: content.trim() })
    }
  }

  return out
}

export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      if (!message) {
        return response.status(400).send({ message: 'Message is required', serve: null })
      }

      // history dikirim dari FE: [{role:'user'|'assistant', content:'...'}, ...]
      const history = sanitizeHistory(request.input('history'))

      const system: ChatMsg = {
        role: 'system',
        content:
          'Kamu adalah Abby n Bev Beauty Assistant. Jawab dalam Bahasa Indonesia, ramah, ringkas, dan lanjutkan konteks percakapan. ' +
          'Kalau user jawab singkat seperti "mau", anggap itu menjawab pertanyaan terakhir assistant. ' +
          'Jangan tampilkan debug, nama file, route, atau kode.',
      }

      const input: ChatMsg[] = [...history, { role: 'user', content: message }]
      const finalInput: ChatMsg[] = [system, ...input]

      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: 'gpt-4.1-mini',
          input: finalInput,
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
        output_text: outputText || 'Maaf bestie, aku belum dapat jawabannya. Coba ulangi ya.',
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

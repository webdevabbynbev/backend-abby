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
      if (c?.type === 'output_text' && typeof c?.text === 'string') parts.push(c.text)
      if (!c?.type && typeof c?.text === 'string') parts.push(c.text)
    }
  }

  return parts.join('\n').trim()
}

function sanitizeHistory(raw: any): ChatMsg[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: ChatMsg[] = []

  // batasi biar token tidak meledak
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

      // session id dari FE (untuk identitas user / future use)
      const sessionId = String(request.input('session_id') || '').trim() || 'anon'

      // history dikirim dari FE: [{role:'user'|'assistant', content:'...'}, ...]
      const history = sanitizeHistory(request.input('history'))

      // system prompt supaya gaya stabil
      const system: ChatMsg = {
        role: 'system',
        content:
          'Kamu adalah Abby n Bev Beauty Assistant. Jawab dalam Bahasa Indonesia, ramah, singkat, dan konsisten. ' +
          'Lanjutkan konteks percakapan. Jika user menjawab singkat seperti "mau", anggap itu merespon pertanyaan terakhir assistant.',
      }

      const input: ChatMsg[] = [system, ...history, { role: 'user', content: message }]

      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          model: 'gpt-4.1-mini',
          user: sessionId, // ✅ optional tapi bagus untuk konsistensi identitas
          input,           // ✅ pakai history + message
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
      console.error(payload)
      return response.status(500).send({
        // pastikan selalu string biar FE tidak render [object Object]
        message: typeof payload === 'string' ? payload : JSON.stringify(payload),
        serve: null,
      })
    }
  }
}

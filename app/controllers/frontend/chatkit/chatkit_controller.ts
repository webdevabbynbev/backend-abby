import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

function extractOutputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text

  const outputs = Array.isArray(data?.output) ? data.output : []
  const parts: string[] = []

  for (const o of outputs) {
    const contents = Array.isArray(o?.content) ? o.content : []
    for (const c of contents) {
      if (c?.type === 'output_text' && typeof c?.text === 'string') parts.push(c.text)
    }
  }

  return parts.join('\n').trim()
}

export default class ChatkitController {
  public async run({ request, response }: HttpContext) {
    try {
      const message = String(request.input('message') || '').trim()
      const sessionId = String(request.input('session_id') || '').trim() || 'anon'

      if (!message) return response.status(400).send({ message: 'Message is required', serve: null })

      const workflowId = env.get('CHATKIT_WORKFLOW_ID') // ✅ pakai env kamu
      if (!workflowId) {
        return response.status(500).send({ message: 'CHATKIT_WORKFLOW_ID is not set', serve: null })
      }

      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          workflow: { id: workflowId }, // ✅ agent/workflow kamu
          user: sessionId,
          input: message,
        },
        {
          headers: {
            Authorization: `Bearer ${env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'chatkit-beta-v1', // ✅ biasanya wajib untuk chatkit workflow
          },
          timeout: 60000,
        }
      )

      const outputText = extractOutputText(r.data)

      return response.status(200).send({
        output_text: outputText || 'Maaf bestie, coba lagi ya.',
        serve: null,
      })
    } catch (error: any) {
      const payload = error?.response?.data || error?.message || 'Unknown error'
      console.error(payload)
      // ✅ paksa jadi string supaya FE tidak dapat object mentah
      return response.status(500).send({
        message: typeof payload === 'string' ? payload : JSON.stringify(payload),
        serve: null,
      })
    }
  }
}

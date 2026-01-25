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

      if (!message) {
        return response.status(400).send({ message: 'Message is required', serve: null })
      }

      const workflowId = env.get('CHATKIT_WORKFLOW_ID')
      if (!workflowId) {
        return response.status(500).send({ message: 'CHATKIT_WORKFLOW_ID is not set', serve: null })
      }

      const r = await axios.post(
        'https://api.openai.com/v1/responses',
        {
          workflow: { id: workflowId },   // ✅ pakai agent/workflow kamu
          user: sessionId,                // ✅ biar state/identitas konsisten di sisi OpenAI (kalau workflow pakai itu)
          input: message,                 // pesan user
        },
        {
          headers: {
            Authorization: `Bearer ${env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
            // kalau workflow kamu memang “ChatKit”, biasanya butuh beta header:
            // 'OpenAI-Beta': 'chatkit-beta-v1',
          },
        }
      )

      const outputText = extractOutputText(r.data)

      return response.status(200).send({
        output_text: outputText || 'Maaf bestie, coba lagi ya.',
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

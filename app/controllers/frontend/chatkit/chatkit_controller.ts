import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import axios from 'axios'

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
        },
        {
          headers: {
            'Authorization': `Bearer ${env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const outputText = r.data?.output?.[0]?.content?.[0]?.text || ''

      return response.status(200).send({
        output_text: outputText,
        serve: null,
      })
    } catch (error) {
      console.error(error.response?.data || error.message)
      return response.status(500).send({
        message: error.response?.data || error.message,
        serve: null,
      })
    }
  }
}

import Env from '#start/env'
import axios from 'axios'

export default class WhatsAppService {
  private apiUrl = Env.get('WHATSAPP_API_URL')
  private phoneNumberId = Env.get('WHATSAPP_PHONE_NUMBER_ID')
  private accessToken = Env.get('WHATSAPP_ACCESS_TOKEN')

  async sendOTP(to: string, otp: string) {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`

    // untuk testing → pakai template "hello_world"
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "hello_world", // template bawaan dari WhatsApp Manager
        language: { code: "en_US" }
      }
    }

    try {
      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      return res.data
    } catch (error: any) {
      console.error("WhatsApp API Error:", error.response?.data || error.message)
      throw error
    }
  }
}

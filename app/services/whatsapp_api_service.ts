import axios from 'axios'
import env from '#start/env'

export default class WhatsAppService {
  private token = env.get('WHATSAPP_ACCESS_TOKEN') as string
  private phoneNumberId = env.get('WHATSAPP_PHONE_NUMBER_ID') as string
  private apiUrl = env.get('WHATSAPP_API_URL') as string

  /**
   * Kirim OTP via WhatsApp Template
   */
  public async sendOTP(to: string, otp: string) {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`

    try {
      const res = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: 'otp_code',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: otp }, // isi ke {{1}} body
                ],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                  { type: 'text', text: otp }, // isi ke {{1}} di URL button
                ],
              },
            ],
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      return res.data
    } catch (error: any) {
      console.error('Error sending OTP via WhatsApp:', error.response?.data || error.message)
      throw new Error('Gagal mengirim OTP via WhatsApp')
    }
  }
}

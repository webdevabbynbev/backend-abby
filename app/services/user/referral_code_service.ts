import User from '#models/user'
import { randomBytes } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class ReferralCodeService {
  public static generate(prefix = 'KOL') {
    // contoh: KOL + 8 hex => KOL1A2B3C4D
    return (prefix + randomBytes(4).toString('hex')).toUpperCase()
  }

  public static async generateUnique(prefix = 'KOL', trx?: TransactionClientContract) {
    for (let i = 0; i < 80; i++) {
      const code = this.generate(prefix)
      const exists = await (trx ? User.query({ client: trx }) : User.query())
        .where('referral_code', code)
        .first()
      if (!exists) return code
    }
    throw new Error('Failed to generate unique referral code')
  }
}

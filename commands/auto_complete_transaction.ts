import Transaction from '#models/transaction'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import moment from 'moment'
import { TransactionStatus } from '../app/enums/transaction_status.js'

export default class AutoCompleteTransaction extends BaseCommand {
  static commandName = 'auto:complete-transaction'
  static description = 'Auto complete transaction from on delivery to completed'

  private sevenDaysAgo: string = ''

  static options: CommandOptions = {
    startApp: true,
  }

  async prepare() {
    const sevenDaysAgo = moment().subtract(7, 'days').startOf('day').format('YYYY-MM-DD')

    this.logger.info(
      `Auto Complete Transaction running at ${moment().format('YYYY-MM-DD HH:mm:ss')}`
    )
    this.logger.info(`Seven days ago: ${sevenDaysAgo}`)

    this.sevenDaysAgo = sevenDaysAgo
  }

  async run() {
    await Transaction.query()
      .where('status', TransactionStatus.ON_DELIVERY)
      .whereRaw('DATE(created_at) = ?', [this.sevenDaysAgo])
      .update({ status: TransactionStatus.COMPLETED })

    this.logger.info(`Update transaction completed`)
  }
}

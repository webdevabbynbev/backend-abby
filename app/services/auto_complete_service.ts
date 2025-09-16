import Transaction from '#models/transaction'
import { TransactionStatus } from '../enums/transaction_status.js'
import moment from 'moment'

export const autoComplete = async () => {
  const sevenDaysAgo = moment().subtract(7, 'days').startOf('day').format('YYYY-MM-DD')

  const transactions = await Transaction.query()
    .where('status', TransactionStatus.ON_DELIVERY)
    .whereRaw('DATE(created_at) = ?', [sevenDaysAgo])

  console.log(transactions)
}

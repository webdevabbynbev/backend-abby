import { OrderReadRepository } from '#services/order/order_read_repository'

type Args = {
  userId: number
  qs: any
}

export class GetUserOrdersUseCase {
  private repo = new OrderReadRepository()

  public async execute(args: Args) {
    return this.repo.listForUser(args.userId, args.qs)
  }
}

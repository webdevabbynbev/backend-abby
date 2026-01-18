export class DiscountCmsService {
  async list(_qs: any) {
    return { data: [], meta: {} }
  }

  async show(_id: any) {
    return {}
  }

  async create(_payload: any) {
    return {}
  }

  async update(_id: any, _payload: any) {
    return { discount: {}, oldData: {} }
  }

  async softDelete(_id: any) {
    return {}
  }

  async updateStatus(_id: any, _isActive: any) {
    return {}
  }
}

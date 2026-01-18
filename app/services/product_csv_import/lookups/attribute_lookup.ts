import Attribute from '#models/attribute'

export default class AttributeLookup {
  private cache = new Map<string, number>()

  async ensureVarianAttributeId(trx: any): Promise<number> {
    const attrName = 'Varian'
    const cached = this.cache.get(attrName)
    if (cached) return cached

    const a = await Attribute.query({ client: trx }).where('name', attrName).first()
    if (a) {
      this.cache.set(attrName, a.id)
      return a.id
    }

    // race-safe
    try {
      const created = await Attribute.create({ name: attrName } as any, { client: trx })
      this.cache.set(attrName, created.id)
      return created.id
    } catch {
      const again = await Attribute.query({ client: trx }).where('name', attrName).firstOrFail()
      this.cache.set(attrName, again.id)
      return again.id
    }
  }

  resetCache() {
    this.cache.clear()
  }
}

import AttributeValue from '#models/attribute_value'

export default class VariantAttributeSyncer {
  async upsertVarianValue(attributeId: number, variantId: number, value: string, trx: any): Promise<boolean> {
    const existing = await AttributeValue.query({ client: trx })
      .where('attribute_id', attributeId)
      .where('product_variant_id', variantId)
      .first()

    if (existing) {
      existing.value = value
      existing.deletedAt = null
      await existing.save()
      return false
    }

    await AttributeValue.create({ attributeId, value, productVariantId: variantId } as any, { client: trx })
    return true
  }
}

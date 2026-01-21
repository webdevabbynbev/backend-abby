export class PromoPivotService {
  private uniqPositiveInts(arr: any[]): number[] {
    return Array.from(
      new Set((arr ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
    )
  }

  public async getPromoProductIds(
    trx: any,
    tableName: string,
    promoKey: string,
    promoId: number
  ): Promise<number[]> {
    const rows = await trx.from(tableName).where(promoKey, promoId).select('product_id')
    return this.uniqPositiveInts(rows.map((r: any) => r.product_id))
  }

  public async replacePromoProducts(
    trx: any,
    tableName: string,
    promoKey: string,
    promoId: number,
    rows: Array<Record<string, any>>
  ): Promise<number[]> {
    await trx.from(tableName).where(promoKey, promoId).delete()

    if (!rows?.length) return []

    // bulk insert (lebih cepat dari loop create)
    await trx.table(tableName).multiInsert(rows)

    return this.uniqPositiveInts(rows.map((r) => r.product_id))
  }
    public async getPromoVariantIds(
    trx: any,
    tableName: string,
    promoKey: string,
    promoId: number
  ): Promise<number[]> {
    const rows = await trx.from(tableName).where(promoKey, promoId).select('product_variant_id')
    return this.uniqPositiveInts(rows.map((r: any) => r.product_variant_id))
  }

  public async replacePromoVariants(
    trx: any,
    tableName: string,
    promoKey: string,
    promoId: number,
    rows: Array<Record<string, any>>
  ): Promise<number[]> {
    await trx.from(tableName).where(promoKey, promoId).delete()
    if (!rows?.length) return []
    await trx.table(tableName).multiInsert(rows)
    return this.uniqPositiveInts(rows.map((r) => r.product_variant_id))
  }

}

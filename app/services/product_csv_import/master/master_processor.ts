import { DateTime } from 'luxon'

import PivotMetaService from '#services/product_csv_import/pivot_meta_service'
import UniqueSlugService from '#services/product_csv_import/unique_slug_service'
import BrandLookup from '#services/product_csv_import/lookups/brand_lookup'
import CategoryLookup from '#services/product_csv_import/lookups/category_lookup'
import TagLookup from '#services/product_csv_import/lookups/tag_lookup'
import ConcernLookup from '#services/product_csv_import/lookups/concern_lookup'
import AttributeLookup from '#services/product_csv_import/lookups/attribute_lookup'

import ProductUpserter from '#services/product_csv_import/master/product_upserter'
import ProductOnlineEnsurer from '#services/product_csv_import/master/product_online_ensurer'
import ProductMediaSyncer from '#services/product_csv_import/master/product_media_syncer'
import ProductTagSyncer from '#services/product_csv_import/master/product_tag_syncer'
import ProductConcernSyncer from '#services/product_csv_import/master/product_concern_syncer'
import VariantUpserter from '#services/product_csv_import/master/variant_upserter'
import VariantAttributeSyncer from '#services/product_csv_import/master/variant_attribute_syncer'

import type { ImportError, MasterGroup, MasterStats } from '#services/product_csv_import/types'
import type { PivotMeta } from '#services/product_csv_import/pivot_meta_service'

type MasterContext = {
  pivot: PivotMeta
  nowSql: string | null
  varianAttrId: number

  brandLookup: BrandLookup
  categoryLookup: CategoryLookup

  productUpserter: ProductUpserter
  onlineEnsurer: ProductOnlineEnsurer
  mediaSyncer: ProductMediaSyncer
  tagSyncer: ProductTagSyncer
  concernSyncer: ProductConcernSyncer
  variantUpserter: VariantUpserter
  variantAttrSyncer: VariantAttributeSyncer
}

export default class MasterProcessor {
  constructor(private pivotMeta = new PivotMetaService()) {}

  private async buildContext(trx: any): Promise<MasterContext> {
    const pivot = await this.pivotMeta.get()

    const uniqueSlug = new UniqueSlugService()
    const brandLookup = new BrandLookup(uniqueSlug)
    const categoryLookup = new CategoryLookup(uniqueSlug)
    const tagLookup = new TagLookup(uniqueSlug)
    const concernLookup = new ConcernLookup(uniqueSlug)
    const attributeLookup = new AttributeLookup()

    const productUpserter = new ProductUpserter(uniqueSlug)
    const onlineEnsurer = new ProductOnlineEnsurer()
    const mediaSyncer = new ProductMediaSyncer()
    const tagSyncer = new ProductTagSyncer(tagLookup)
    const concernSyncer = new ProductConcernSyncer(concernLookup)
    const variantUpserter = new VariantUpserter()
    const variantAttrSyncer = new VariantAttributeSyncer()

    const nowSql = DateTime.now().toSQL()
    const varianAttrId = await attributeLookup.ensureVarianAttributeId(trx)

    return {
      pivot,
      nowSql,
      varianAttrId,
      brandLookup,
      categoryLookup,
      productUpserter,
      onlineEnsurer,
      mediaSyncer,
      tagSyncer,
      concernSyncer,
      variantUpserter,
      variantAttrSyncer,
    }
  }

  async process(groups: Map<string, MasterGroup>, stats: MasterStats, trx: any, errors: ImportError[]): Promise<void> {
    const ctx = await this.buildContext(trx)

    let idx = 0

    for (const g of groups.values()) {
      const sp = `sp_csv_${idx++}`

      // SAVEPOINT: biar kalau group ini error, transaksi besar tidak "aborted"
      await trx.rawQuery(`SAVEPOINT ${sp}`)

      try {
        const categoryTypeId = await ctx.categoryLookup.getId(g.parentCat || '', g.sub1 || '', g.sub2 || '', trx)
        const brandId = await ctx.brandLookup.getId(g.brandName || '', trx)

        if (!categoryTypeId) {
          errors.push({ row: '-', name: g.productName, message: 'Gagal membuat/menemukan kategori' })
          await trx.rawQuery(`ROLLBACK TO SAVEPOINT ${sp}`)
          await trx.rawQuery(`RELEASE SAVEPOINT ${sp}`)
          continue
        }

        // 1) Product upsert
        const { product, created } = await ctx.productUpserter.upsert(g, { categoryTypeId, brandId }, trx)
        if (created) stats.productCreated += 1
        else stats.productUpdated += 1

        // 2) Online ensure
        if (await ctx.onlineEnsurer.ensure(product.id, trx)) stats.onlineCreated += 1

        // 3) Media sync (product)
        stats.mediaCreated += await ctx.mediaSyncer.sync(product.id, g.photos || [], g.productName || null, trx)

        // 4) Tags sync
        stats.tagAttached += await ctx.tagSyncer.sync(product.id, g.tags || '', ctx.pivot, ctx.nowSql, trx)

        // 5) Concerns sync (error concerns gak boleh ngegagalin group seluruhnya)
        try {
          stats.concernAttached += await ctx.concernSyncer.sync(
            product.id,
            g.concern || '',
            g.subConcern || '',
            ctx.pivot,
            trx
          )
        } catch (e: any) {
          errors.push({
            row: '-',
            name: g.productName,
            message: `Concern sync gagal: ${e?.message || 'unknown error'}`,
          })
        }

        // 6) Variants upsert + variant media
        const vres = await ctx.variantUpserter.upsertFromGroup(product.id, g.productName, g.variants || [], trx, errors)
        stats.variantCreated += vres.variantCreated
        stats.mediaCreated += vres.mediaCreated

        // 7) Variant attribute (Varian)
        for (const it of vres.items) {
          const createdAv = await ctx.variantAttrSyncer.upsertVarianValue(
            ctx.varianAttrId,
            it.variant.id,
            it.variantName,
            trx
          )
          if (createdAv) stats.variantAttrAttached += 1
        }

        // group ini sukses → release savepoint
        await trx.rawQuery(`RELEASE SAVEPOINT ${sp}`)
      } catch (e: any) {
        // IMPORTANT: rollback dulu, baru lanjut group berikutnya
        try {
          await trx.rawQuery(`ROLLBACK TO SAVEPOINT ${sp}`)
          await trx.rawQuery(`RELEASE SAVEPOINT ${sp}`)
        } catch {}

        errors.push({
          row: '-',
          name: g?.productName,
          message: `Group gagal diproses: ${e?.message || 'unknown error'}`,
        })
      }
    }
  }
}

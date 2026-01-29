import { BaseCommand } from '@adonisjs/core/ace'
import { CommandOptions } from '@adonisjs/core/types/ace'
import Product from '#models/product'
import CategoryType from '#models/category_type'
import Persona from '#models/persona'

export default class SyncProductPersonas extends BaseCommand {
  static commandName = 'sync:product-personas'
  static description = 'Auto-assign persona to products based on category type (makeup=Abby, skincare=Bev)'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('🔄 Starting product persona sync...')

    try {
      // Get personas
      const abbyPersona = await Persona.query().where('slug', 'abby').whereNull('deleted_at').first()
      const bevPersona = await Persona.query().where('slug', 'bev').whereNull('deleted_at').first()

      if (!abbyPersona || !bevPersona) {
        this.logger.error('❌ Persona Abby or Bev not found in database')
        return
      }

      this.logger.info(`✅ Found personas: Abby (ID: ${abbyPersona.id}), Bev (ID: ${bevPersona.id})`)

      // Load categories (including children)
      const categories = await CategoryType.query().whereNull('deleted_at')
      const categoryMap = new Map<number, CategoryType>()
      for (const c of categories) categoryMap.set(c.id, c)

      const resolveRootSlug = (categoryId?: number | null) => {
        let currentId = categoryId ?? null
        let safety = 0
        while (currentId && safety < 10) {
          const category = categoryMap.get(currentId)
          if (!category) return null
          if (!category.parentId) return category.slug
          currentId = category.parentId
          safety++
        }
        return null
      }

      // Update products based on root category
      const products = await Product.query().whereNull('deleted_at')

      let updatedMakeup = 0
      let updatedSkincare = 0

      for (const product of products) {
        const rootSlug = resolveRootSlug(product.categoryTypeId)
        if (rootSlug === 'makeup') {
          if (product.personaId !== abbyPersona.id) {
            product.personaId = abbyPersona.id
            await product.save()
            updatedMakeup++
          }
        } else if (rootSlug === 'skincare') {
          if (product.personaId !== bevPersona.id) {
            product.personaId = bevPersona.id
            await product.save()
            updatedSkincare++
          }
        }
      }

      this.logger.info(`✅ Updated ${updatedMakeup} makeup products -> Abby`)
      this.logger.info(`✅ Updated ${updatedSkincare} skincare products -> Bev`)

      this.logger.success(`🎉 Sync completed! Total updated: ${updatedMakeup + updatedSkincare} products`)
    } catch (error) {
      this.logger.error(`❌ Error: ${error.message}`)
      throw error
    }
  }
}

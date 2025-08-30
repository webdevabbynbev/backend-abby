import type { HttpContext } from '@adonisjs/core/http'
import Brand from '#models/brand'

export default class BrandsController {
  /**
   * List brands grouped by first letter (for navigation menu / directory)
   * - if letter = "#" → all brands
   * - if letter = "A" → only brands starting with A
   */
  public async list({ response, request }: HttpContext) {
    try {
      const letter = request.input('letter')

      // ambil semua brand aktif & belum terhapus
      const allBrands = await Brand.query()
        .whereNull('deleted_at')
        .andWhere('is_active', 1)
        .orderBy('name', 'asc')

      // filter by letter jika bukan "#"
      const filteredBrands =
        letter && letter !== '#'
          ? allBrands.filter(
              (b) => b.name.charAt(0).toUpperCase() === letter.toUpperCase()
            )
          : allBrands

      // group by first letter
      const grouped = filteredBrands.reduce(
        (acc: Record<string, any[]>, brand) => {
          const l = brand.name.charAt(0).toUpperCase()
          if (!acc[l]) acc[l] = []
          acc[l].push(brand)
          return acc
        },
        {}
      )

      // hasil akhir urut A-Z
      const result = Object.keys(grouped)
        .sort()
        .map((letter) => ({
          letter,
          children: grouped[letter],
        }))

      return response.status(200).send({
        message: 'Success',
        serve: result,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Show brand detail by slug (with products)
   */
  public async show({ response, params }: HttpContext) {
    try {
      const { slug } = params

      const brand = await Brand.query()
        .where('slug', slug)
        .whereNull('deleted_at')
        .andWhere('is_active', 1)
        .preload('products', (q) => {
          q.whereNull('deleted_at').andWhere('is_active', 1)
        })
        .first()

      if (!brand) {
        return response.status(404).send({
          message: 'Brand not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'Success',
        serve: brand,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}

import { DateTime } from 'luxon'
import { afterFetch, afterFind, column, computed } from '@adonisjs/lucid/orm'
import { CustomBaseModel } from '#services/custom_base_model'

export default class Banner extends CustomBaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string | null

  @column()
  declare image: string

  @column()
  declare imageMobile: string

  @column()
  declare position: string | null

  @column()
  declare order: number

  @column({ columnName: 'created_by' })
  declare createdBy: number | null

  @column({ columnName: 'updated_by' })
  declare updatedBy: number | null
  
  @column()
  declare description: string | null

  @column({ serializeAs: 'button_text' })
  declare buttonText: string | null

  @column({ serializeAs: 'button_url' })
  declare buttonUrl: string | null

  @column({ serializeAs: 'has_button' })
  declare hasButton: number

  @column.dateTime({ serializeAs: null })
  declare deletedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @computed({ serializeAs: 'image_url' })
  declare imageUrl: string

  @computed({ serializeAs: 'image_mobile_url' })
  declare imageMobileUrl: string

  /**
   * Resolve image URL for local filesystem (fs)
   */
  private resolveUrl(path?: string): string {
    if (!path) return ''

    return path.startsWith('http')
      ? path
      : path.startsWith('/uploads/')
        ? path
        : path.startsWith('uploads/')
          ? `/${path}`
          : `/uploads/${path}`
  }

  /**
   * Populate computed URLs
   */
  public async getImageUrl() {
    this.imageUrl = this.resolveUrl(this.image)
    this.imageMobileUrl = this.resolveUrl(this.imageMobile)
  }

  @computed({ serializeAs: 'file_desktop_type' })
  public get fileDesktopType() {
    if (!this.image) return null
    return this.image.split('.').pop()?.toLowerCase() === 'mp4'
      ? 'video'
      : 'image'
  }

  @computed({ serializeAs: 'file_mobile_type' })
  public get fileMobileType() {
    if (!this.imageMobile) return null
    return this.imageMobile.split('.').pop()?.toLowerCase() === 'mp4'
      ? 'video'
      : 'image'
  }

  @afterFetch()
  public static async afterFetchHook(models: Banner[]) {
    for (const model of models) {
      model.getImageUrl()
    }
  }

  @afterFind()
  public static async afterFindHook(model: Banner) {
    model.getImageUrl()
  }
}

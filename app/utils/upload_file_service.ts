import path from 'path'
import fs from 'fs'
import { cuid } from '@adonisjs/core/helpers'
import Helpers from './helpers.js'
import { uploadToS3 } from '#utils/s3'
import { storeImageLink } from '#utils/image_link_storage'

export default class FileUploadService {
  private static sanitizeBaseName(name: string) {
    // replace unsafe URL chars (space, etc) via Helpers, and also harden against path traversal
    const safe = Helpers.replaceUrlUnsafeCharacters(String(name)).replace(/[\/\\]/g, '_')
    return Helpers.stripFileExtension(safe)
  }

  public static async uploadFile(
    file: any,
    options: { folder: string; type?: string },
    extra?: { publicId?: string }
  ) {
    try {
      const fileExtName: Record<string, string> = {
        'application/msword': 'doc',
        'application/vnd.ms-excel': 'xls',
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }

      console.log('[uploadFile] clientName:', file?.clientName)
      console.log('[uploadFile] tmpPath:', file?.tmpPath)
      console.log('[uploadFile] content-type:', file?.headers?.['content-type'])
      console.log('[uploadFile] folder:', options?.folder, 'publicId:', extra?.publicId)

      if (!file?.tmpPath) {
        throw new Error('uploadFile: tmpPath is missing')
      }

      const folder = (options.folder ?? 'others').replace(/^[\/\\]+/, '').replace(/[\\]+/g, '/')
      const fileType = options.type ? `${options.type}_` : ''

      const fileExtension =
        fileExtName[file?.headers?.['content-type']] ||
        path.extname(file?.clientName ?? '').slice(1) ||
        'unknown'

      const fileMimeType = file?.headers?.['content-type'] || 'application/octet-stream'

      // ✅ kalau publicId dikirim (mis. barcode), nama file S3 = publicId (tanpa cuid)
      //    kalau tidak, fallback pake clientName + cuid (behavior lama)
      const baseName = extra?.publicId
        ? this.sanitizeBaseName(extra.publicId)
        : this.sanitizeBaseName(file?.clientName ?? 'file')

      const newFile = extra?.publicId
        ? `${folder}/${fileType}${baseName}.${fileExtension}` // fixed name (barcode)
        : `${folder}/${fileType}${baseName}-${cuid()}.${fileExtension}` // old behavior

      const fileBuffer = await fs.promises.readFile(file.tmpPath)

      const uploadedUrl = await uploadToS3({
        key: newFile,
        body: fileBuffer,
        contentType: fileMimeType,
      })

      await storeImageLink(uploadedUrl)

      return uploadedUrl
    } catch (error) {
      console.error('Error uploading attachment:', error)
      throw error
    }
  }
}

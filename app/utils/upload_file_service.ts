import path from 'path'
import fs from 'fs'
import { cuid } from '@adonisjs/core/helpers'
import Helpers from './helpers.js'
import { uploadToS3 } from '#utils/s3'
import { storeImageLink } from '#utils/image_link_storage'

export default class FileUploadService {
  public static async uploadFile(
    file: any,
    options: { folder: string; type?: string },
    extra?: { publicId?: string }
  ) {
    try {
      const fileExtName: any = {
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

      const filename = Helpers.stripFileExtension(
        Helpers.replaceUrlUnsafeCharacters(file.clientName)
      )

      const folder = options.folder ?? 'others'
      const fileType = options.type ? `${options.type}_` : ''

      const fileExtension =
        fileExtName[file.headers?.['content-type']] ||
        path.extname(file.clientName).slice(1) ||
        'unknown'

      const fileMimeType = file.headers?.['content-type'] || 'application/octet-stream'

      // ✅ fallback ke drive lokal (kalau cloudinary belum diset / gagal)
      const newFile = `${folder}/${fileType}${filename}-${cuid()}.${fileExtension}`
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

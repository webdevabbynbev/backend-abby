import type { HttpContext } from '@adonisjs/core/http'
import { uploadToS3, buildS3Url } from '#utils/s3'
import { storeImageLink } from '#utils/image_link_storage'

import fs from 'node:fs'
import path from 'node:path'

function stripDirs(name: string) {
  return String(name || '').split(/[\\/]/).pop() || String(name || '')
}

export default class UploadsController {
  public async upload({ response, request }: HttpContext) {
    let tmpPath: string | null = null

    try {
      const fileValidation = request.file('file', {
        size: '500mb',
        extnames: ['jpg', 'jpeg', 'gif', 'png', 'pdf', 'doc', 'docx', 'mp4', 'webp'],
      })

      if (!fileValidation?.isValid) {
        return response.status(422).send({
          message: 'Failed to upload file.',
          serve: [],
        })
      }

      const file = request.file('file')
      const clientNameRaw = stripDirs(file?.clientName || 'file')
      const sanitizedFileName = clientNameRaw.replace(/\s+/g, '_')
      const timestamp = Date.now()
      const newFileName = `${timestamp}_${sanitizedFileName}`

      tmpPath = file?.tmpPath || null
      if (!tmpPath) {
        return response.status(422).send({
          message: 'Failed to upload file.',
          serve: [],
        })
      }

      const uploadedKey = await uploadToS3({
        key: `uploads/${newFileName}`,
        body: await fs.promises.readFile(tmpPath),
        contentType: file?.headers?.['content-type'],
      })

      await storeImageLink(uploadedKey)

      const publicUrl = buildS3Url(uploadedKey)

      return response.status(200).send({
        message: '',
        serve: publicUrl,
        signedUrl: publicUrl,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message,
        serve: [],
      })
    } finally {
      if (tmpPath) {
        await fs.promises.unlink(tmpPath).catch(() => {})
      }
    }
  }
}

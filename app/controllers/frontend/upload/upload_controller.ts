import type { HttpContext } from '@adonisjs/core/http'
import { buildS3Url, uploadToS3 } from '#utils/s3'
import { storeImageLink } from '#utils/image_link_storage'

import fs from 'fs'

export default class UploadsController {
  public async upload({ response, request }: HttpContext) {
    try {
      const file = request.file('file')
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

      const sanitizedFileName = file?.clientName.replace(/\s+/g, '_')
      const timestamp = Date.now()
      const newFileName = `${timestamp}_${sanitizedFileName}`

      const tmpPath = request.file('file')?.tmpPath
      if (!tmpPath) {
        return response.status(422).send({
          message: 'Failed to upload file.',
          serve: [],
        })
      }

      const uploadedKey = await uploadToS3({
        key: `uploads/${newFileName}`,
        body: await fs.promises.readFile(tmpPath),
        contentType: request.file('file')?.headers['content-type'],
      })
     
      const uploadedUrl = buildS3Url(uploadedKey)

      await storeImageLink(uploadedUrl)
      return response.status(200).send({
        message: '',
        serve: uploadedUrl,
        signedUrl: uploadedUrl,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message,
        serve: [],
      })
    }
  }
}

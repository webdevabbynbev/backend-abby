import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import drive from '@adonisjs/drive/services/main'
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

      await drive
        .use(env.get('DRIVE_DISK'))
        .put('/' + newFileName, await fs.promises.readFile(request.file('file')?.tmpPath!), {
          ContentType: request.file('file')?.headers['content-type'],
          visibility: 'private',
        })

      return response.status(200).send({
        message: '',
        serve: newFileName,
        signedUrl: await drive.use(env.get('DRIVE_DISK')).getSignedUrl(newFileName),
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message,
        serve: [],
      })
    }
  }
}

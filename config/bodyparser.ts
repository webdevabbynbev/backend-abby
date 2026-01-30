import { defineConfig } from '@adonisjs/core/bodyparser'
import { cuid } from '@adonisjs/core/helpers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const resolveTmpDir = () => {
  const preferred = process.env.UPLOAD_TMP_DIR?.trim() || '/dev/shm'
  if (preferred && fs.existsSync(preferred)) {
    return preferred
  }
  return os.tmpdir()
}

const uploadTmpDir = resolveTmpDir()

const bodyParserConfig = defineConfig({
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  form: {
    convertEmptyStringsToNull: true,
    types: ['application/x-www-form-urlencoded'],
  },

  json: {
    convertEmptyStringsToNull: true,
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  multipart: {
    /**
     * Tetap true untuk endpoint normal.
     * Tapi untuk endpoint yang masuk processManually, autoProcess akan di-skip
     * dan kamu wajib handle request.multipart sendiri (streaming).
     */
    autoProcess: true,
    convertEmptyStringsToNull: true,

    /**
     * WAJIB: endpoint upload media diproses manual biar ZERO TMP FILE
     * gunakan wildcard agar match param :id
     */
    processManually: [
      '/api/v1/admin/product/*/medias',
      '/api/v1/admin/product/*/medias/bulk',
    ],
    
    tmpFileName: () => path.join(uploadTmpDir, `adonis-upload-${cuid()}`),

    /**
     * Naikkan limit agar nggak gampang "request entity too large"
     */
    limit: '200mb',
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig

console.log('[utils/response] loaded')

import type { HttpContext } from '@adonisjs/core/http'
import { vineMessagesToString } from './validation.js'

type Response = HttpContext['response']
type AnyObj = Record<string, any>

export function ok(
  response: Response,
  serve: any,
  status = 200,
  message = 'success',
  extra?: AnyObj
) {
  return response.status(status).send({
    message,
    serve,
    ...(extra || {}),
  })
}

export function fail(
  response: Response,
  status: number,
  message: string,
  serve: any = null,
  extra?: AnyObj
) {
  return response.status(status).send({
    message,
    serve,
    ...(extra || {}),
  })
}

export function badRequest(response: Response, message: string) {
  return response.badRequest({ message, serve: null })
}

export function badRequest400(response: Response, message: string) {
  return response.status(400).send({ message, serve: null })
}

export function internalError(response: Response, error: any) {
  const isValidation =
    error?.status === 422 ||
    error?.code === 'E_VALIDATION_ERROR' ||
    error?.code === 'E_VALIDATION_FAILURE' ||
    error?.name === 'E_VALIDATION_ERROR' ||
    error?.name === 'E_VALIDATION_FAILURE'

  if (isValidation) {
    return response.status(422).send({
      message: vineMessagesToString(error),
      errors: error?.messages ?? null,
      serve: null,
    })
  }

  return response.status(500).send({
    message: error?.message || 'Internal Server Error',
    serve: null,
  })
}

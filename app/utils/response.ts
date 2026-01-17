import type { HttpContext } from '@adonisjs/core/http'

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
  return response.status(500).send({
    message: error?.message || 'Internal Server Error',
    serve: null,
  })
}

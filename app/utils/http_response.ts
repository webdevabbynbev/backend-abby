import type { Response } from '@adonisjs/core/http'

type AnyObj = Record<string, any>

export function ok(response: Response, serve: any, status = 200, message = 'success') {
  return response.status(status).send({ message, serve })
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

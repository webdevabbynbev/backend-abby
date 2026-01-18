export class AppError extends Error {
  public status: number
  public serve: any

  constructor(message: string, status = 400, serve: any = null) {
    super(message)
    this.status = status
    this.serve = serve
  }
}

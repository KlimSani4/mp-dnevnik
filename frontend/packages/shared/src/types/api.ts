export interface ApiError {
  detail: string
  code: string
}

export interface ValidationError {
  detail: Array<{
    loc: string[]
    msg: string
    type: string
  }>
}

export type ApiResponse<T> = T | ApiError | ValidationError

export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'detail' in response &&
    'code' in response
  )
}

export function isValidationError(response: unknown): response is ValidationError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'detail' in response &&
    Array.isArray((response as ValidationError).detail)
  )
}

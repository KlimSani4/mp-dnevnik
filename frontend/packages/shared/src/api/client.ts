import type { ApiError, ValidationError } from '../types'

export interface ApiClientConfig {
  baseUrl: string
  getToken?: () => string | null
  onUnauthorized?: () => void
}

export class ApiClient {
  private baseUrl: string
  private getToken: () => string | null
  private onUnauthorized: () => void

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.getToken = config.getToken ?? (() => null)
    this.onUnauthorized = config.onUnauthorized ?? (() => {})
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown
      params?: Record<string, string | number | boolean | undefined>
      auth?: boolean
    } = {}
  ): Promise<T> {
    const { body, params, auth = true } = options

    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      })
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (auth) {
      const token = this.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) {
      this.onUnauthorized()
      throw new ApiClientError('Unauthorized', 'UNAUTHORIZED', 401)
    }

    if (response.status === 204) {
      return undefined as T
    }

    const data = await response.json()

    if (!response.ok) {
      if (isApiError(data)) {
        throw new ApiClientError(data.detail, data.code, response.status)
      }
      if (isValidationError(data)) {
        throw new ValidationClientError(data.detail, response.status)
      }
      throw new ApiClientError('Unknown error', 'UNKNOWN', response.status)
    }

    return data as T
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>('GET', path, { params })
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body })
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body })
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export class ValidationClientError extends Error {
  constructor(
    public errors: Array<{ loc: string[]; msg: string; type: string }>,
    public status: number
  ) {
    super('Validation error')
    this.name = 'ValidationClientError'
  }
}

function isApiError(data: unknown): data is ApiError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'detail' in data &&
    'code' in data &&
    typeof (data as ApiError).code === 'string'
  )
}

function isValidationError(data: unknown): data is ValidationError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'detail' in data &&
    Array.isArray((data as ValidationError).detail)
  )
}

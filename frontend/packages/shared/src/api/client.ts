import type { ApiError, ValidationError, AuthTokens } from '../types'

export interface ApiClientConfig {
  baseUrl: string
  getToken?: () => string | null
  getRefreshToken?: () => string | null
  onUnauthorized?: () => void
  onTokensRefreshed?: (tokens: AuthTokens) => void
}

export class ApiClient {
  private baseUrl: string
  private getToken: () => string | null
  private getRefreshToken: (() => string | null) | undefined
  private onUnauthorized: () => void
  private onTokensRefreshed: ((tokens: AuthTokens) => void) | undefined
  private isRefreshing = false
  private refreshSubscribers: Array<(token: string) => void> = []

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.getToken = config.getToken ?? (() => null)
    this.getRefreshToken = config.getRefreshToken
    this.onUnauthorized = config.onUnauthorized ?? (() => {})
    this.onTokensRefreshed = config.onTokensRefreshed
  }

  private async handleUnauthorized(retryRequest: () => Promise<Response>): Promise<Response> {
    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.refreshSubscribers.push((_token: string) => {
          retryRequest().then(resolve).catch(reject)
        })
      })
    }

    const refreshToken = this.getRefreshToken?.()
    if (!refreshToken) {
      this.onUnauthorized()
      throw new ApiClientError('Unauthorized', 'UNAUTHORIZED', 401)
    }

    this.isRefreshing = true
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!response.ok) {
        this.refreshSubscribers = []
        this.onUnauthorized()
        throw new ApiClientError('Session expired', 'UNAUTHORIZED', 401)
      }

      const data = await response.json()
      this.onTokensRefreshed?.(data)
      this.refreshSubscribers.forEach((cb) => cb(data.access_token))
      this.refreshSubscribers = []

      return retryRequest()
    } catch (e) {
      if (!(e instanceof ApiClientError)) {
        this.refreshSubscribers = []
        this.onUnauthorized()
      }
      throw e
    } finally {
      this.isRefreshing = false
    }
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params?: Record<string, any>
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

    const makeRequest = () =>
      fetch(url.toString(), {
        method,
        headers: {
          ...headers,
          ...(auth && this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) {
      const retried = await this.handleUnauthorized(makeRequest)
      if (retried.status === 204) {
        return undefined as T
      }
      const retriedData = await retried.json()
      if (!retried.ok) {
        if (isApiError(retriedData)) {
          throw new ApiClientError(retriedData.detail, retriedData.code, retried.status)
        }
        if (isValidationError(retriedData)) {
          throw new ValidationClientError(retriedData.detail, retried.status)
        }
        throw new ApiClientError('Unknown error', 'UNKNOWN', retried.status)
      }
      return retriedData as T
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get<T>(path: string, params?: Record<string, any>) {
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

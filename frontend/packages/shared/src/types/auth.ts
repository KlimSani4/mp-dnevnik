export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface TelegramAuthRequest {
  init_data: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

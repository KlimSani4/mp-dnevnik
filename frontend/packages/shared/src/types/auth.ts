export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface TelegramWidgetData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface TelegramAuthRequest {
  init_data?: string
  widget_data?: TelegramWidgetData
}

export interface RefreshTokenRequest {
  refresh_token: string
}

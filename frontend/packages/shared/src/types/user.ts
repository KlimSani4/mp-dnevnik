export interface UserSettings {
  notifications: boolean
  theme: 'light' | 'dark' | 'auto'
}

export interface User {
  id: string
  display_name: string
  settings: UserSettings
  created_at: string
}

export interface UserUpdateRequest {
  display_name?: string
  settings?: Partial<UserSettings>
}

export interface UserDataExport {
  user: User
  consents: unknown[]
  audit_logs_count: number
}

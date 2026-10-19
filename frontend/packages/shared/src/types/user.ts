export interface UserSettings {
  notifications: boolean
  theme: 'light' | 'dark' | 'auto'
  /** За сколько минут до пары напоминать в Telegram */
  class_reminder_minutes?: 10 | 15
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

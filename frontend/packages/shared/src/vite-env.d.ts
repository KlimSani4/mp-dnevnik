// Declare Vite's import.meta.env for packages that use it outside of Vite's own type system
declare interface ImportMeta {
  readonly env: Record<string, string | boolean | undefined>
}

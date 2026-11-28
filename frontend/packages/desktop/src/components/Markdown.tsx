/**
 * Описание в Markdown (#165): **жирный**, *курсив*, списки, `код`, ссылки, таблицы (GFM).
 * Сырой HTML не рендерится (react-markdown его экранирует) — XSS из описания не пройдёт.
 */
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { clsx } from 'clsx'

const components: Components = {
  a: ({ node: _n, ...p }) => (
    <a {...p} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline underline-offset-2 hover:text-primary-700 dark:text-primary-400" />
  ),
  p: ({ node: _n, ...p }) => <p {...p} className="my-1.5 first:mt-0 last:mb-0" />,
  ul: ({ node: _n, ...p }) => <ul {...p} className="my-1.5 list-disc space-y-0.5 pl-5" />,
  ol: ({ node: _n, ...p }) => <ol {...p} className="my-1.5 list-decimal space-y-0.5 pl-5" />,
  h1: ({ node: _n, ...p }) => <h3 {...p} className="mb-1 mt-3 text-base font-semibold text-surface-900 first:mt-0 dark:text-surface-50" />,
  h2: ({ node: _n, ...p }) => <h4 {...p} className="mb-1 mt-3 text-sm font-semibold text-surface-900 first:mt-0 dark:text-surface-50" />,
  h3: ({ node: _n, ...p }) => <h5 {...p} className="mb-1 mt-2 text-sm font-semibold text-surface-800 first:mt-0 dark:text-surface-100" />,
  strong: ({ node: _n, ...p }) => <strong {...p} className="font-semibold text-surface-800 dark:text-surface-100" />,
  blockquote: ({ node: _n, ...p }) => <blockquote {...p} className="my-2 border-l-2 border-surface-300 pl-3 text-surface-500 dark:border-surface-600" />,
  code: ({ node: _n, className, ...p }) => (
    <code {...p} className={clsx('rounded bg-surface-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-surface-700', className)} />
  ),
  pre: ({ node: _n, ...p }) => <pre {...p} className="my-2 overflow-x-auto rounded-lg bg-surface-100 p-3 text-xs dark:bg-surface-900 [&>code]:bg-transparent [&>code]:p-0" />,
  table: ({ node: _n, ...p }) => <div className="my-2 overflow-x-auto"><table {...p} className="text-xs" /></div>,
  th: ({ node: _n, ...p }) => <th {...p} className="border border-surface-200 px-2 py-1 text-left font-semibold dark:border-surface-700" />,
  td: ({ node: _n, ...p }) => <td {...p} className="border border-surface-200 px-2 py-1 dark:border-surface-700" />,
  hr: () => <hr className="my-3 border-surface-200 dark:border-surface-700" />,
  input: ({ node: _n, ...p }) => <input {...p} disabled className="mr-1.5 align-middle" />,
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx('break-words text-sm leading-relaxed text-surface-600 dark:text-surface-400', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

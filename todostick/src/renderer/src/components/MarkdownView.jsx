import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 메모(task.memo, completion_note 등)를 마크다운으로 렌더한다.
// 입력은 plain text textarea 그대로 사용 → 사용자가 직접 # / **bold** / - [x] 같은 syntax를 적는다.
// 외부 링크는 Electron renderer에서 새 창이 안 떠 IPC로 외부 브라우저를 연다.

function ExternalLink({ href, children }) {
  const onClick = (e) => {
    e.preventDefault()
    if (href && window.api?.shell?.openExternal) {
      window.api.shell.openExternal(href)
    }
  }
  return (
    <a href={href} onClick={onClick} className="text-indigo-600 hover:text-indigo-800 underline">
      {children}
    </a>
  )
}

export default function MarkdownView({ text, className = '' }) {
  if (!text) return null
  return (
    <div className={`markdown-view ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ExternalLink
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

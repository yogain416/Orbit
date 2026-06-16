import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
import { useEffect } from 'react'

// 노션 스타일 inline 마크다운 에디터.
// 입력 도중 "# " + space → H1, "**굵게**" → bold, "- [ ]" → 체크박스 등 즉시 변환된다(StarterKit + TaskList shortcut).
// 저장 시 markdown 문자열로 export → DB(task.memo, settings.memo)와 호환.

function ToolbarButton({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // 클릭 시 focus 손실 방지 — caret 유지
      onClick={onClick}
      title={title}
      className={`min-w-[20px] h-5 px-1 rounded text-[11px] font-semibold flex items-center justify-center transition-colors ${
        active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null
  const sep = <span className="w-px h-3 bg-gray-200 dark:bg-slate-600 mx-0.5" />
  const promptLink = () => {
    const prev = editor.getAttributes('link').href
    const url = window.prompt('링크 URL', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }
  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-gray-200 dark:border-slate-700 pb-1 mb-1.5 sticky top-0 bg-inherit z-10">
      <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게 (Ctrl+B)"><strong>B</strong></ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임 (Ctrl+I)"><em>I</em></ToolbarButton>
      <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선"><s>S</s></ToolbarButton>
      {sep}
      <ToolbarButton active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1">H1</ToolbarButton>
      <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2">H2</ToolbarButton>
      <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="제목 3">H3</ToolbarButton>
      {sep}
      <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="글머리 기호">•</ToolbarButton>
      <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="번호 매기기">1.</ToolbarButton>
      <ToolbarButton active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="체크박스">☐</ToolbarButton>
      {sep}
      <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="인용">❝</ToolbarButton>
      <ToolbarButton active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="인라인 코드">{'<>'}</ToolbarButton>
      <ToolbarButton active={editor.isActive('link')} onClick={promptLink} title="링크">🔗</ToolbarButton>
      {sep}
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="실행 취소 (Ctrl+Z)">↶</ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="다시 실행 (Ctrl+Y)">↷</ToolbarButton>
    </div>
  )
}

export default function RichMemoEditor({ value, onChange, onBlur, tone = 'indigo', containerClassName, showToolbar = true }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'rich-code-block' } }
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener', target: '_blank' }
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true
      })
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown()
      onChange(md)
    },
    onBlur: () => { if (onBlur) onBlur() },
    editorProps: {
      attributes: {
        // markdown-view 클래스를 공유 → DayView 미리보기와 같은 prose 스타일이 에디터 안에도 적용된다.
        class: 'markdown-view rich-memo-prose focus:outline-none',
        spellcheck: 'false'
      },
      handleClickOn: (view, pos, node, nodePos, event) => {
        // 링크 클릭 시 외부 브라우저 — Electron renderer는 target=_blank 만으론 안 열림.
        const target = event.target.closest('a')
        if (target && target.href) {
          event.preventDefault()
          if (window.api?.shell?.openExternal) {
            window.api.shell.openExternal(target.href)
          }
          return true
        }
        return false
      }
    }
  })

  // 외부에서 value가 바뀌었을 때(다른 task 열기, 노트 전환 등) editor content 동기화.
  // 사용자 타이핑 중인 markdown과 현재 value가 일치하면 setContent 호출 안 함 — caret 손실 방지.
  useEffect(() => {
    if (!editor) return
    const current = editor.storage.markdown.getMarkdown()
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) return null

  const borderClass = tone === 'green'
    ? 'border-green-200 focus-within:border-green-400 bg-green-50 dark:bg-emerald-500/10'
    : tone === 'yellow'
      ? 'border-yellow-200 focus-within:border-yellow-400 bg-yellow-50 dark:bg-slate-800'
      : 'border-gray-200 dark:border-slate-600 focus-within:border-indigo-400 bg-white dark:bg-slate-800'

  // containerClassName이 주어지면 wrapper 스타일을 완전히 override — 호출자가 flex-1 등 레이아웃 결정
  const wrapperClass = containerClassName
    || `rich-memo-shell border ${borderClass} rounded-lg px-3 py-2 transition-colors min-h-[6rem]`

  return (
    <div className={wrapperClass}>
      {showToolbar && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

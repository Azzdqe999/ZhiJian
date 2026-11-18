import { useEffect, useState } from 'react'
import { askBook, loadAiConfig } from '../lib/ai'

type Props = {
  open: boolean
  title: string
  context: string
  onClose: () => void
  onToast: (message: string) => void
}

export default function AiQaModal({ open, title, context, onClose, onToast }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuestion('')
      setAnswer('')
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const ask = async () => {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setAnswer('')
    try {
      const config = await loadAiConfig()
      if (!config.apiKey.trim() && config.provider !== 'ollama') {
        onToast('先在设置里配置 AI')
        return
      }
      setAnswer(await askBook(config, text, '《' + title + '》\n' + context))
    } catch (error) {
      onToast('问书失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="qa-backdrop" onClick={onClose}>
      <div className="qa-card" onClick={(event) => event.stopPropagation()}>
        <div className="qa-head">
          <div>
            <div className="eyebrow">AI 问书</div>
            <h2>《{title}》</h2>
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <p className="setting-foot">只根据当前章节正文回答；正文没写的内容会直接说明。</p>
        <textarea
          className="qa-input"
          autoFocus
          rows={3}
          placeholder="例如：这一章普莉希拉为什么出现？"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void ask()
          }}
        />
        <div className="qa-actions">
          <button className="btn small solid" onClick={() => void ask()} disabled={busy || !question.trim()}>
            {busy ? '思考中…' : '提问'}
          </button>
          <span className="setting-foot">Ctrl+Enter 发送</span>
        </div>
        {answer ? <div className="qa-answer">{answer}</div> : null}
      </div>
    </div>
  )
}

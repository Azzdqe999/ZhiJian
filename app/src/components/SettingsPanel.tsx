import { useEffect, useState } from 'react'
import type { AiConfig, FontFamily, SyncConfig, Theme } from '../lib/types'
import { FONT_OPTIONS } from '../lib/fonts'
import { getSyncConfig, saveSyncConfig } from '../lib/store'
import { syncNow, testConnection } from '../lib/sync'
import { AI_MODELS, AI_PRESETS, EMPTY_AI, loadAiConfig, persistAiConfig, testAi } from '../lib/ai'
import { checkForUpdate, getAppVersion, installUpdate, isNativeUpdater } from '../lib/updater'
import type { UpdateInfo } from '../lib/updater'

type Props = {
  fontSize: number
  onFontSize: (size: number) => void
  theme: Theme
  onTheme: (theme: Theme) => void
  fontFamily: FontFamily
  onFontFamily: (font: FontFamily) => void
  markEnabled: boolean
  onToggleMark: () => void
  characterCount: number
  noteCount: number
  imageCount: number
  bookCount: number
  onToast?: (text: string) => void
  onSynced?: () => void | Promise<void>
}

const EMPTY_SYNC: SyncConfig = {
  url: 'https://dav.jianguoyun.com/dav/',
  user: '',
  pass: '',
  enabled: true,
}

export default function SettingsPanel(props: Props) {
  const [sync, setSync] = useState<SyncConfig>(EMPTY_SYNC)
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateNote, setUpdateNote] = useState('')
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const [ai, setAi] = useState<AiConfig>(EMPTY_AI)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState('')

  useEffect(() => {
    void getSyncConfig().then((value) => {
      if (value) setSync({ ...EMPTY_SYNC, ...value })
    })
    void loadAiConfig().then(setAi)
    if (isNativeUpdater()) {
      void getAppVersion().then((version) => {
        if (version) setAppVersion(version.versionName + '（' + version.versionCode + '）')
      })
    }
  }, [])

  const onCheckUpdate = async () => {
    setUpdateBusy(true)
    setUpdateNote('')
    try {
      const info = await checkForUpdate()
      setUpdateInfo(info)
      setUpdateNote(info ? '发现新版本 v' + info.versionName : '已经是最新版本')
    } catch (error) {
      setUpdateNote('检查失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setUpdateBusy(false)
    }
  }

  const onInstallUpdate = async () => {
    if (!updateInfo) return
    setUpdateBusy(true)
    try {
      await installUpdate(updateInfo.url)
      setUpdateNote('已开始下载；首次更新需允许“安装未知应用”，授权后若没弹安装请再点一次更新')
    } catch (error) {
      setUpdateNote('更新失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setUpdateBusy(false)
    }
  }

  const persist = async (): Promise<SyncConfig> => {
    const fixed = { ...sync, url: sync.url.trim() }
    await saveSyncConfig(fixed)
    setSync(fixed)
    return fixed
  }

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

  const onSave = async () => {
    setBusy('save')
    setStatus('')
    try {
      await persist()
      setStatus('已保存')
    } catch (error) {
      setStatus('保存失败：' + message(error))
    } finally {
      setBusy('')
    }
  }

  const onTest = async () => {
    setBusy('test')
    setStatus('正在连接…')
    try {
      const fixed = await persist()
      await testConnection(fixed)
      setStatus('连接成功')
      props.onToast?.('同步连接成功')
    } catch (error) {
      setStatus('连接失败：' + message(error))
    } finally {
      setBusy('')
    }
  }

  const onSync = async () => {
    setBusy('sync')
    setStatus('正在同步…')
    try {
      const fixed = await persist()
      await testConnection(fixed)
      const result = await syncNow()
      const skipped = result.skipped ? ' · 跳过 ' + result.skipped + ' 个超大文件' : ''
      setStatus('同步完成：' + result.books + ' 本书 · ' + result.notes + ' 条笔记 · ' + result.characters + ' 位人物' + skipped)
      props.onToast?.('同步完成')
      await props.onSynced?.()
    } catch (error) {
      setStatus('同步失败：' + message(error))
    } finally {
      setBusy('')
    }
  }

  const onAiSave = async () => {
    setAiBusy(true)
    setAiStatus('')
    try {
      await persistAiConfig(ai)
      setAiStatus('已保存')
    } catch (error) {
      setAiStatus('保存失败：' + message(error))
    } finally {
      setAiBusy(false)
    }
  }

  const onAiTest = async () => {
    setAiBusy(true)
    setAiStatus('正在请求…')
    try {
      await persistAiConfig(ai)
      const reply = await testAi(ai)
      setAiStatus('可用：' + reply.trim().slice(0, 40))
    } catch (error) {
      setAiStatus('失败：' + message(error))
    } finally {
      setAiBusy(false)
    }
  }

  const changeProvider = (provider: AiConfig['provider']) => {
    const preset = AI_PRESETS[provider]
    setAi({ ...ai, provider, baseUrl: preset.baseUrl, model: preset.model })
  }

  return (
    <main className="main settings-page">
      <header className="page-head">
        <div>
          <h1>设置</h1>
          <p className="sub">排版、人物标记、同步与本地存储</p>
        </div>
      </header>

      <section className="setting-card">
        <h2>阅读</h2>
        <div className="setting-row">
          <div>
            <strong>正文字号</strong>
            <p>EPUB 与 TXT 共用，作用在正文上，不改原文件。</p>
          </div>
          <div className="setting-inline">
            <button className="btn small" onClick={() => props.onFontSize(Math.max(15, props.fontSize - 1))}>A−</button>
            <span className="setting-value">{props.fontSize}px</span>
            <button className="btn small" onClick={() => props.onFontSize(Math.min(30, props.fontSize + 1))}>A+</button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>字体</strong>
            <p>宋体适合长读，黑体清晰，楷体偏纸书。</p>
          </div>
          <div className="setting-inline">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.key}
                className={'chip' + (props.fontFamily === font.key ? ' is-on' : '')}
                onClick={() => props.onFontFamily(font.key)}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>主题</strong>
            <p>纸色 / 夜间，侧栏与阅读区一起切换。</p>
          </div>
          <div className="setting-inline">
            <button className={'chip' + (props.theme === 'paper' ? ' is-on' : '')} onClick={() => props.onTheme('paper')}>纸色</button>
            <button className={'chip' + (props.theme === 'night' ? ' is-on' : '')} onClick={() => props.onTheme('night')}>夜间</button>
          </div>
        </div>
      </section>

      <section className="setting-card">
        <h2>人物</h2>
        <div className="setting-row">
          <div>
            <strong>正文人物标记</strong>
            <p>关闭后正文不再标虚线，人物页与档案不受影响。</p>
          </div>
          <button
            className={'switch' + (props.markEnabled ? ' is-on' : '')}
            role="switch"
            aria-checked={props.markEnabled}
            onClick={props.onToggleMark}
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>匹配规则</strong>
            <p>最长优先；别名参与；默认忽略单字名；不做分词。同名不同书不合并。</p>
          </div>
        </div>
      </section>

      <section className="setting-card">
        <h2>AI</h2>
        <div className="setting-row">
          <div>
            <strong>模型服务</strong>
            <p>Gemini 免费层 / 本地 Ollama / 任意 OpenAI 兼容。模型名照服务商给的填，中转服务把 Base URL 换成它的 /v1。</p>
          </div>
        </div>
        <div className="sync-form">
          <label>
            <span>服务</span>
            <select value={ai.provider} onChange={(event) => changeProvider(event.target.value as AiConfig['provider'])}>
              {Object.entries(AI_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Base URL</span>
            <input value={ai.baseUrl} onChange={(event) => setAi({ ...ai, baseUrl: event.target.value })} spellCheck={false} />
          </label>
          <label>
            <span>模型</span>
            <input list="ai-models" value={ai.model} onChange={(event) => setAi({ ...ai, model: event.target.value })} spellCheck={false} />
            <datalist id="ai-models">
              {AI_MODELS.map((model) => <option key={model} value={model} />)}
            </datalist>
          </label>
          <label>
            <span>API Key</span>
            <input
              type="password"
              value={ai.apiKey}
              onChange={(event) => setAi({ ...ai, apiKey: event.target.value })}
              placeholder="Gemini Key / 本地模型可留空"
            />
          </label>
        </div>
        <div className="setting-inline sync-actions">
          <button className="btn small" onClick={onAiTest} disabled={aiBusy}>{aiBusy ? '请求中…' : '测试 AI'}</button>
          <button className="btn small" onClick={onAiSave} disabled={aiBusy}>保存</button>
          {aiStatus && <span className="setting-value">{aiStatus}</span>}
        </div>
        <p className="setting-foot">Gemini 免费层有限速；免费层数据可能被用于改进服务。只发送你手动触发的章节。</p>
      </section>

      <section className="setting-card">
        <h2>同步</h2>
        <div className="setting-row">
          <div>
            <strong>WebDAV（坚果云）</strong>
            <p>同步书架、进度、笔记、人物与插画；书文件按需上传。应用密码不是登录密码。</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>启动时自动同步</strong>
            <p>打开应用后后台同步一次；5 分钟内不重复。</p>
          </div>
          <button
            className={'switch' + (sync.enabled ? ' is-on' : '')}
            role="switch"
            aria-checked={sync.enabled}
            onClick={() => {
              const next = { ...sync, enabled: !sync.enabled }
              setSync(next)
              void saveSyncConfig(next)
            }}
          >
            <span />
          </button>
        </div>
        <div className="sync-form">
          <label>
            <span>服务器</span>
            <input
              value={sync.url}
              onChange={(event) => setSync({ ...sync, url: event.target.value })}
              placeholder="https://dav.jianguoyun.com/dav/"
              spellCheck={false}
            />
          </label>
          <label>
            <span>账号</span>
            <input
              value={sync.user}
              onChange={(event) => setSync({ ...sync, user: event.target.value })}
              placeholder="邮箱"
              spellCheck={false}
            />
          </label>
          <label>
            <span>应用密码</span>
            <input
              type="password"
              value={sync.pass}
              onChange={(event) => setSync({ ...sync, pass: event.target.value })}
              placeholder="坚果云应用密码"
            />
          </label>
        </div>
        <div className="setting-inline sync-actions">
          <button className="btn small" onClick={onTest} disabled={!!busy}>{busy === 'test' ? '连接中…' : '测试连接'}</button>
          <button className="btn small solid" onClick={onSync} disabled={!!busy}>{busy === 'sync' ? '同步中…' : '立即同步'}</button>
          <button className="btn small" onClick={onSave} disabled={!!busy}>保存</button>
          {sync.lastSyncAt ? <span className="setting-value">上次 {new Date(sync.lastSyncAt).toLocaleString()}</span> : null}
        </div>
        {status && <p className="setting-foot">{status}</p>}
      </section>

      {isNativeUpdater() ? (
        <section className="setting-card">
          <h2>版本与更新</h2>
          <div className="setting-row">
            <div>
              <strong>当前版本</strong>
              <p>{appVersion || '读取中…'}</p>
            </div>
          </div>
          <div className="setting-inline sync-actions">
            <button className="btn small" onClick={onCheckUpdate} disabled={updateBusy}>
              {updateBusy ? '检查中…' : '检查更新'}
            </button>
            {updateInfo ? (
              <button className="btn small solid" onClick={onInstallUpdate} disabled={updateBusy}>
                更新到 v{updateInfo.versionName}
              </button>
            ) : null}
          </div>
          {updateNote ? <p className="setting-foot">{updateNote}</p> : null}
          <p className="setting-foot">更新包从 GitHub Releases 下载；安装时系统会再确认一次。</p>
        </section>
      ) : null}

      <section className="setting-card">
        <h2>本地存储</h2>
        <div className="setting-stats">
          <div><strong>{props.bookCount}</strong><span>本书</span></div>
          <div><strong>{props.characterCount}</strong><span>位人物</span></div>
          <div><strong>{props.imageCount}</strong><span>张插画</span></div>
          <div><strong>{props.noteCount}</strong><span>条笔记</span></div>
        </div>
        <p className="setting-foot">全部数据在 IndexedDB（paper-between），纯本地、无账号、无遥测。</p>
      </section>
    </main>
  )
}

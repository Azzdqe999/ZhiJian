import { useEffect, useState } from 'react'
import { FONT_OPTIONS } from '../lib/fonts'
import type { FontFamily, Theme } from '../lib/types'

type SheetTab = 'type' | 'read' | 'tools'

type Props = {
  fontSize: number
  onFontSize: (size: number) => void
  fontFamily: FontFamily
  onFontFamily: (font: FontFamily) => void
  theme: Theme
  onTheme: (theme: Theme) => void
  readingMode: 'scroll' | 'paged'
  onReadingMode: (mode: 'scroll' | 'paged') => void
  markEnabled: boolean
  onToggleMark: () => void
  lineHeight: number
  onLineHeight: (value: number) => void
  paragraphGap: number
  onParagraphGap: (value: number) => void
  pageMargin: number
  onPageMargin: (value: number) => void
  textIndent: boolean
  onToggleIndent: () => void
  textAlign: 'left' | 'justify'
  onTextAlign: (value: 'left' | 'justify') => void
  volumePaging: boolean
  onVolumePaging: (value: boolean) => void
  showVolumePaging: boolean
  onClose: () => void
}

const TAB_KEY = 'paper-sheet-tab'

export default function ReaderSheet({
  fontSize,
  onFontSize,
  fontFamily,
  onFontFamily,
  theme,
  onTheme,
  readingMode,
  onReadingMode,
  markEnabled,
  onToggleMark,
  lineHeight,
  onLineHeight,
  paragraphGap,
  onParagraphGap,
  pageMargin,
  onPageMargin,
  textIndent,
  onToggleIndent,
  textAlign,
  onTextAlign,
  volumePaging,
  onVolumePaging,
  showVolumePaging,
  onClose,
}: Props) {
  const [tab, setTab] = useState<SheetTab>(() => {
    const saved = localStorage.getItem(TAB_KEY)
    return saved === 'read' || saved === 'tools' ? saved : 'type'
  })

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  const chip = (active: boolean) => 'sheet-chip' + (active ? ' is-on' : '')

  return (
    <div className="reader-sheet-backdrop" onClick={onClose}>
      <div className="reader-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="reader-sheet-handle" />
        <div className="reader-sheet-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'type'} className={tab === 'type' ? 'is-on' : ''} onClick={() => setTab('type')}>排版</button>
          <button role="tab" aria-selected={tab === 'read'} className={tab === 'read' ? 'is-on' : ''} onClick={() => setTab('read')}>阅读</button>
          <button role="tab" aria-selected={tab === 'tools'} className={tab === 'tools' ? 'is-on' : ''} onClick={() => setTab('tools')}>工具</button>
        </div>

        {tab === 'type' ? (
          <>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">字号</span>
              <div className="reader-sheet-controls">
                <button className="sheet-btn" onClick={() => onFontSize(Math.max(15, fontSize - 1))}>A−</button>
                <span className="sheet-value">{fontSize}px</span>
                <button className="sheet-btn" onClick={() => onFontSize(Math.min(30, fontSize + 1))}>A+</button>
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">行距</span>
              <div className="reader-sheet-controls">
                {[1.7, 1.95, 2.2].map((value) => (
                  <button key={value} className={chip(Math.abs(lineHeight - value) < 0.01)} onClick={() => onLineHeight(value)}>{value}</button>
                ))}
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">段距</span>
              <div className="reader-sheet-controls">
                {[0.4, 0.7, 1].map((value) => (
                  <button key={value} className={chip(Math.abs(paragraphGap - value) < 0.01)} onClick={() => onParagraphGap(value)}>{value === 0.4 ? '紧' : value === 0.7 ? '中' : '松'}</button>
                ))}
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">页边距</span>
              <div className="reader-sheet-controls">
                {[18, 30, 46].map((value) => (
                  <button key={value} className={chip(pageMargin === value)} onClick={() => onPageMargin(value)}>{value === 18 ? '窄' : value === 30 ? '中' : '宽'}</button>
                ))}
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">正文</span>
              <div className="reader-sheet-controls">
                <button className={chip(textIndent)} onClick={onToggleIndent}>首行缩进</button>
                <button className={chip(textAlign === 'justify')} onClick={() => onTextAlign('justify')}>两端对齐</button>
                <button className={chip(textAlign === 'left')} onClick={() => onTextAlign('left')}>左对齐</button>
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">字体</span>
              <div className="reader-sheet-controls">
                {FONT_OPTIONS.map((font) => (
                  <button key={font.key} className={chip(fontFamily === font.key)} onClick={() => onFontFamily(font.key)}>{font.label}</button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {tab === 'read' ? (
          <>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">主题</span>
              <div className="reader-sheet-controls">
                <button className={chip(theme === 'paper')} onClick={() => onTheme('paper')}>纸色</button>
                <button className={chip(theme === 'night')} onClick={() => onTheme('night')}>夜间</button>
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">阅读模式</span>
              <div className="reader-sheet-controls">
                <button className={chip(readingMode === 'scroll')} onClick={() => onReadingMode('scroll')}>往下滑</button>
                <button className={chip(readingMode === 'paged')} onClick={() => onReadingMode('paged')}>翻页</button>
              </div>
            </div>
            {showVolumePaging ? (
              <div className="reader-sheet-row">
                <span className="reader-sheet-label">音量键</span>
                <div className="reader-sheet-controls">
                  <button className={chip(volumePaging)} onClick={() => onVolumePaging(!volumePaging)}>
                    {volumePaging ? '翻页已开启' : '翻页已关闭'}
                  </button>
                </div>
              </div>
            ) : null}
            <p className="reader-sheet-note">手机右边缘上下滑动可调亮度；点击正文中间可再次打开这个面板。</p>
          </>
        ) : null}

        {tab === 'tools' ? (
          <>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">AI</span>
              <div className="reader-sheet-controls">
                <button className="sheet-chip" onClick={() => window.dispatchEvent(new CustomEvent('paper:ai', { detail: { kind: 'character' } }))}>识别人物</button>
                <button className="sheet-chip" onClick={() => window.dispatchEvent(new CustomEvent('paper:ai', { detail: { kind: 'place' } }))}>识别地名</button>
                <button className="sheet-chip" onClick={() => window.dispatchEvent(new Event('paper:qa'))}>问书</button>
              </div>
            </div>
            <div className="reader-sheet-row">
              <span className="reader-sheet-label">正文标记</span>
              <div className="reader-sheet-controls">
                <button className={chip(markEnabled)} onClick={onToggleMark}>{markEnabled ? '已开启' : '已关闭'}</button>
              </div>
            </div>
            <p className="reader-sheet-note">识别人物/地名会先给出结果，确认后再加入人物库。</p>
          </>
        ) : null}

        <button className="reader-sheet-close" onClick={onClose}>完成</button>
      </div>
    </div>
  )
}

import { FONT_OPTIONS } from '../lib/fonts'
import type { FontFamily, Theme } from '../lib/types'

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
  onClose: () => void
}

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
  onClose,
}: Props) {
  return (
    <div className="reader-sheet-backdrop">
      <div className="reader-sheet" onClick={(event) => event.stopPropagation()}>
        <button className="reader-sheet-x" onClick={onClose} title="关闭">×</button>
        <div className="reader-sheet-handle" />
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
              <button key={value} className={'sheet-chip' + (Math.abs(lineHeight - value) < 0.01 ? ' is-on' : '')} onClick={() => onLineHeight(value)}>{value}</button>
            ))}
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">段距</span>
          <div className="reader-sheet-controls">
            {[0.4, 0.7, 1].map((value) => (
              <button key={value} className={'sheet-chip' + (Math.abs(paragraphGap - value) < 0.01 ? ' is-on' : '')} onClick={() => onParagraphGap(value)}>{value === 0.4 ? '紧' : value === 0.7 ? '中' : '松'}</button>
            ))}
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">页边距</span>
          <div className="reader-sheet-controls">
            {[18, 30, 46].map((value) => (
              <button key={value} className={'sheet-chip' + (pageMargin === value ? ' is-on' : '')} onClick={() => onPageMargin(value)}>{value === 18 ? '窄' : value === 30 ? '中' : '宽'}</button>
            ))}
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">正文</span>
          <div className="reader-sheet-controls">
            <button className={'sheet-chip' + (textIndent ? ' is-on' : '')} onClick={onToggleIndent}>首行缩进</button>
            <button className={'sheet-chip' + (textAlign === 'justify' ? ' is-on' : '')} onClick={() => onTextAlign('justify')}>两端对齐</button>
            <button className={'sheet-chip' + (textAlign === 'left' ? ' is-on' : '')} onClick={() => onTextAlign('left')}>左对齐</button>
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">字体</span>
          <div className="reader-sheet-controls">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.key}
                className={'sheet-chip' + (fontFamily === font.key ? ' is-on' : '')}
                onClick={() => onFontFamily(font.key)}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">主题</span>
          <div className="reader-sheet-controls">
            <button className={'sheet-chip' + (theme === 'paper' ? ' is-on' : '')} onClick={() => onTheme('paper')}>纸色</button>
            <button className={'sheet-chip' + (theme === 'night' ? ' is-on' : '')} onClick={() => onTheme('night')}>夜间</button>
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">阅读模式</span>
          <div className="reader-sheet-controls">
            <button className={'sheet-chip' + (readingMode === 'scroll' ? ' is-on' : '')} onClick={() => onReadingMode('scroll')}>往下滑</button>
            <button className={'sheet-chip' + (readingMode === 'paged' ? ' is-on' : '')} onClick={() => onReadingMode('paged')}>翻页</button>
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">AI 抽取</span>
          <div className="reader-sheet-controls">
            <button className="sheet-chip" onClick={() => window.dispatchEvent(new CustomEvent('paper:ai', { detail: { kind: 'character' } }))}>人物</button>
            <button className="sheet-chip" onClick={() => window.dispatchEvent(new CustomEvent('paper:ai', { detail: { kind: 'place' } }))}>地名</button>
          </div>
        </div>
        <div className="reader-sheet-row">
          <span className="reader-sheet-label">正文标记</span>
          <div className="reader-sheet-controls">
            <button className={'sheet-chip' + (markEnabled ? ' is-on' : '')} onClick={onToggleMark}>
              {markEnabled ? '已开启' : '已关闭'}
            </button>
          </div>
        </div>
        <button className="reader-sheet-close" onClick={onClose}>完成</button>
      </div>
    </div>
  )
}

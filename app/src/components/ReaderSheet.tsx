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
  onClose,
}: Props) {
  return (
    <div className="reader-sheet-backdrop" onClick={onClose}>
      <div className="reader-sheet" onClick={(event) => event.stopPropagation()}>
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

export type TtsSegment = { text: string; para: number }

/** 把段落切成适合朗读的小段，保留所属段落索引 */
export function buildTtsSegments(paragraphs: string[], max = 140): TtsSegment[] {
  const out: TtsSegment[] = []
  paragraphs.forEach((paragraph, para) => {
    const text = paragraph.trim()
    if (!text) return
    const pieces = text.match(/[^。！？!?；;…\n]+[。！？!?；;…]?/g) || [text]
    let buffer = ''
    for (const piece of pieces) {
      if (piece.length > max) {
        if (buffer.trim()) { out.push({ text: buffer.trim(), para }); buffer = '' }
        for (let i = 0; i < piece.length; i += max) {
          const part = piece.slice(i, i + max).trim()
          if (part) out.push({ text: part, para })
        }
        continue
      }
      if (buffer.length + piece.length > max && buffer.trim()) {
        out.push({ text: buffer.trim(), para })
        buffer = ''
      }
      buffer += piece
    }
    if (buffer.trim()) out.push({ text: buffer.trim(), para })
  })
  return out
}

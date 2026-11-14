/** 把用户选的图片压成缩略图 Blob（列表/悬停卡用）；失败时退回原图 */
export async function makeThumbnail(blob: Blob, max = 420): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function') return blob
    const bitmap = await createImageBitmap(blob)
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > 0 ? Math.min(1, max / longest) : 1
    if (scale >= 1 && blob.size <= 140 * 1024) {
      bitmap.close()
      return blob
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return blob
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const thumb = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return thumb ?? blob
  } catch {
    return blob
  }
}

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || '')
}

/** 从剪贴板 / DataTransfer 里挑出图片 */
export function imageFilesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return []
  const files: File[] = []
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    if (!item || item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isImageFile(file)) files.push(file)
  }
  if (!files.length && data.files) {
    for (let i = 0; i < data.files.length; i++) {
      const file = data.files[i]
      if (isImageFile(file)) files.push(file)
    }
  }
  return files
}

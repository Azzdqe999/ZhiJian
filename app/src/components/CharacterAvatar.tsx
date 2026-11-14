import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Character, CharacterImage } from '../lib/types'
import { initialsOf } from '../lib/characters'
import { useObjectUrl } from '../lib/objectUrl'

type Props = {
  character: Character
  images?: CharacterImage[]
  size?: number
  className?: string
}

export default function CharacterAvatar({ character, images = [], size = 44, className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const avatar = images.find((image) => image.id === character.avatarImageId)
  const localUrl = useObjectUrl(avatar ? avatar.thumb || avatar.blob : null)
  const url = localUrl || (failed ? '' : character.avatarUrl || '')
  const style = {
    width: size,
    height: size,
    background: url ? '#e8e0d2' : character.color,
    fontSize: Math.max(10, Math.round(size * 0.34)),
  } as CSSProperties

  return (
    <div className={'char-avatar' + (className ? ' ' + className : '')} style={style} title={character.name}>
      {url ? <img src={url} alt={character.name} onError={() => setFailed(true)} /> : <span>{initialsOf(character.name)}</span>}
    </div>
  )
}

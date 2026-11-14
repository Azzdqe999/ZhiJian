import type { CSSProperties, ReactNode } from 'react'
import { matchText } from '../lib/characters'
import type { CharacterMatcher, CardRect } from '../lib/characters'

type Props = {
  text: string
  matcher: CharacterMatcher | null
  enabled: boolean
  onEnter: (characterId: string, rect: CardRect) => void
  onLeave: () => void
  onClick: (characterId: string) => void
}

function rectOf(element: HTMLElement): CardRect {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
}

/** TXT 正文：把名字包成虚线标记，不改变文本本身 */
export default function CharacterText({ text, matcher, enabled, onEnter, onLeave, onClick }: Props) {
  if (!enabled || !matcher) return <>{text}</>
  const matches = matchText(text, matcher)
  if (!matches.length) return <>{text}</>

  const nodes: ReactNode[] = []
  let cursor = 0
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    if (match.start > cursor) nodes.push(text.slice(cursor, match.start))
    const style = { ['--char' as string]: match.character.color } as CSSProperties
    nodes.push(
      <span
        key={'c' + i}
        className="char"
        data-cid={match.character.id}
        style={style}
        onMouseEnter={(event) => onEnter(match.character.id, rectOf(event.currentTarget))}
        onMouseLeave={onLeave}
        onClick={(event) => {
          event.stopPropagation()
          onClick(match.character.id)
        }}
      >
        {match.text}
      </span>,
    )
    cursor = match.end
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

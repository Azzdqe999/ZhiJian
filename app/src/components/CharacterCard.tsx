import type { Character, CharacterImage } from '../lib/types'
import { useObjectUrl } from '../lib/objectUrl'
import CharacterAvatar from './CharacterAvatar'

type Props = {
  character: Character
  images: CharacterImage[]
  left: number
  top: number
  onOpen: () => void
  onEnter: () => void
  onLeave: () => void
}

function Shot({ image }: { image: CharacterImage }) {
  const url = useObjectUrl(image.thumb || image.blob)
  return <span className="shot" style={url ? { backgroundImage: 'url(' + url + ')' } : undefined} />
}

/** 桌面悬停卡：头像 / 姓名 / 别名 / 身份 / 简介 / 标签 / 3 张插画 */
export default function CharacterCard({ character, images, left, top, onOpen, onEnter, onLeave }: Props) {
  const shots = images.slice(0, 3)
  return (
    <div
      className="char-card"
      data-cid={character.id}
      style={{ left, top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="cc-top">
        <CharacterAvatar character={character} images={images} size={44} />
        <div className="cc-id">
          <div className="cc-name">{character.name}</div>
          <div className="cc-role">{character.role || '身份未写'}</div>
        </div>
      </div>
      <div className="cc-alias">别名：{character.aliases.length ? character.aliases.join('、') : '暂无'}</div>
      <p className="cc-bio">{character.bio || '还没有写简介。'}</p>
      <div className="cc-tags">
        {character.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
      </div>
      <div className="cc-shots">
        {shots.map((image) => <Shot key={image.id} image={image} />)}
        {Array.from({ length: Math.max(0, 3 - shots.length) }).map((_, index) => <span key={'s' + index} className="shot is-empty" />)}
      </div>
      <button className="cc-more" onClick={onOpen}>打开人物档案 <span>→</span></button>
    </div>
  )
}

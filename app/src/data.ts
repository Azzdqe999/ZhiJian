export type Character = {
  id: string
  name: string
  aliases: string[]
  role: string
  bio: string
  tags: string[]
  color: string
}

export const characters: Character[] = [
  {
    id: 'li',
    name: '李寒衣',
    aliases: ['李三娘', '寒衣'],
    role: '北境刀客',
    bio: '北境十三刀里唯一的活口。如今替人押货过河，刀很少出鞘。',
    tags: ['主角', '刀客', '北境'],
    color: '#A4552F',
  },
  {
    id: 'xie',
    name: '谢无咎',
    aliases: ['谢先生', '无咎'],
    role: '说书人',
    bio: '在破庙里说了十年旧案。他的伞落满雪，却从不化。',
    tags: ['说书人', '旧案'],
    color: '#4C6B62',
  },
  {
    id: 'yuan',
    name: '阿沅',
    aliases: ['阿沅'],
    role: '渡口船家女',
    bio: '撑船为生，记性极好。记得每个渡河人欠下的船钱。',
    tags: ['船家', '渡口'],
    color: '#6D597A',
  },
]

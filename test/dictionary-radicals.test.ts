import { describe, it, expect } from 'vitest'
import { radicalInfo } from '@/lib/dictionary/radicals'

describe('radicalInfo', () => {
  it('looks up a radical by its canonical Kangxi glyph', () => {
    expect(radicalInfo('子')).toMatchObject({ number: 39, hanViet: 'tử', meaning: 'con' })
    expect(radicalInfo('女')).toMatchObject({ hanViet: 'nữ', meaning: 'đàn bà' })
    expect(radicalInfo('犬')).toMatchObject({ hanViet: 'khuyển', meaning: 'chó' })
    expect(radicalInfo('白')).toMatchObject({ hanViet: 'bạch' })
  })
  it('resolves common simplified / combining variants to the canonical radical', () => {
    expect(radicalInfo('氵')).toMatchObject({ char: '水', hanViet: 'thủy' }) // water
    expect(radicalInfo('辶')).toMatchObject({ char: '辵', hanViet: 'sước' }) // walk
    expect(radicalInfo('讠')).toMatchObject({ char: '言', hanViet: 'ngôn' }) // speech
    expect(radicalInfo('扌')).toMatchObject({ char: '手', hanViet: 'thủ' }) // hand
  })
  it('returns null for an unknown or empty glyph', () => {
    expect(radicalInfo('xyz')).toBeNull()
    expect(radicalInfo('')).toBeNull()
    expect(radicalInfo(null)).toBeNull()
  })
  it('covers all 214 radicals', () => {
    // every radical number 1..214 resolvable by its canonical glyph
    const glyphs = '一丨丶丿乙亅二亠人儿入八冂冖冫几凵刀力勹匕匚匸十卜卩厂厶又口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡彳心戈戶手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴立竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里金長門阜隶隹雨青非面革韋韭音頁風飛食首香馬骨高髟鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑黹黽鼎鼓鼠鼻齊齒龍龜龠'
    expect([...glyphs].every((g) => radicalInfo(g) !== null)).toBe(true)
    expect([...glyphs]).toHaveLength(214)
  })
})

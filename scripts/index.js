import fs from 'node:fs'
import path from 'node:path'
import { fetch } from 'undici'

const year = 2026
const season = 2

const PUBLIC_HEADER = {
  'User-Agent': 'BangumiSchedules (+https://bgm.cfm.moe; https://github.com/qiaoshouzi/bangumi-schedules-db/blob/main/scripts/index.js)'
}
const PUBLIC_COOKIES = {
  anime_schedule_wiki_lang: 'zh-CN',
  anime_schedule_lang: 'zh-CN',
}
const langCode = 'zh-hans'

class API {
  token = undefined

  getTokenFromHeaders(resp) {
    const cookies = resp.headers
      .getSetCookie()
      .map((v) => v.split('; ')[0]?.split('='))
      .filter((v) => v?.[0] === 'anime_schedule_public_api_token')
    return cookies?.[0]?.[1]
  }
  async getToken() {
    const headers = new Headers()
    for (const [k, v] of Object.entries(PUBLIC_HEADER)) headers.set(k, v)
    const resp = await fetch('https://bgm.wiki')
    if (!resp.ok) throw new Error(`getToken: fetchError: ${resp.status}: ${resp.statusText}`)
    return this.getTokenFromHeaders(resp)
  }
  async getData(url) {
    if (this.token === undefined) this.token = await this.getToken()

    const headers = new Headers()
    headers.set('x-public-api-token', this.token)
    headers.set('Cookie', Object.entries(PUBLIC_COOKIES).map(([k, v]) => `${k}=${v}`).join('; '))
    for (const [k, v] of Object.entries(PUBLIC_HEADER)) headers.set(k, v)
    const resp = await fetch(url, { headers })
    if (!resp.ok) throw new Error(`getData: fetchError: ${resp.status}: ${resp.statusText}`)
    this.token = this.getTokenFromHeaders(resp)
    return await resp.json()
  }
}

const main = async () => {
  const testFolderPath = path.join(import.meta.dirname, '../test/', `${year}-${season}`, langCode)
  fs.mkdirSync(testFolderPath, { recursive: true })

  const api = new API()
  const catalogDataFilePath = path.join(testFolderPath, 'data.json')
  let catalogData;
  if (fs.existsSync(catalogDataFilePath)) {
    catalogData = JSON.parse(fs.readFileSync(catalogDataFilePath, 'utf-8'))
  } else {
    catalogData = await api.getData(`https://bgm.wiki/api/season/${year}-${season}/catalog`)
    fs.writeFileSync(catalogDataFilePath, JSON.stringify(catalogData), 'utf-8')
  }
  console.log(`Get Catalog data Done`)

  const items = {}
  for (const i of catalogData.items) {
    const id = i.id
    const isContinue = i.isContinue
    const title = {
      main: i.title,
      jp: i.japanTitle,
    }

    const detailDataFilePath = path.join(testFolderPath, `${id}.json`)
    let detailData;
    if (fs.existsSync(detailDataFilePath)) {
      detailData = JSON.parse(fs.readFileSync(detailDataFilePath, 'utf-8'))
    } else {
      detailData = await api.getData(`https://bgm.wiki/api/anime/${id}/detail`)
      fs.writeFileSync(detailDataFilePath, JSON.stringify(detailData), 'utf-8')
    }
    console.log(`Get Detail ${id} Done`)

    const item = {
      isContinue,
      title,
      schedules: []
    }
    for (const ii of detailData.anime.progressSlots[0].onairs) {
      const platform = {
        name: ii.platformDisplay,
      }
      const url = ii.url
      if (url && url !== '') platform.url = url
      const areas = ii.areasPrimary.map((v) => v.code)
      const time = ii.premiereTime
      item.schedules.push({ platform, areas, time })
    }
    items[id] = item
  }
  const outputFolderPath = path.join(import.meta.dirname, '../data/', langCode)
  fs.mkdirSync(outputFolderPath, { recursive: true })
  fs.writeFileSync(path.join(outputFolderPath, `${year}-${season}.json`), JSON.stringify(items), 'utf-8')
}
main()

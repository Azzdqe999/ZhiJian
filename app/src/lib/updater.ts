import { Capacitor, registerPlugin } from '@capacitor/core'

export type AppVersion = { versionCode: number; versionName: string }
export type UpdateInfo = {
  versionCode: number
  versionName: string
  currentVersionName: string
  url: string
  notes: string
}

type AppUpdaterPlugin = {
  getVersion(): Promise<AppVersion>
  downloadAndInstall(options: { url: string }): Promise<{ downloadId: number }>
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater')
const REPO = 'Azzdqe999/ZhiJian'

export function isNativeUpdater(): boolean {
  return Capacitor.isNativePlatform()
}

export async function getAppVersion(): Promise<AppVersion | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const version = await AppUpdater.getVersion()
    return { versionCode: Number(version.versionCode) || 0, versionName: version.versionName || '' }
  } catch {
    return null
  }
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null
  const current = await getAppVersion()
  if (!current) return null
  const releaseResponse = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!releaseResponse.ok) return null
  const release = (await releaseResponse.json()) as {
    tag_name?: string
    body?: string
    assets?: Array<{ name: string; browser_download_url: string }>
  }
  const assets = release.assets || []
  const manifestAsset = assets.find((asset) => asset.name === 'version.json')
  const apkAsset = assets.find((asset) => asset.name === 'app-release.apk')
  if (!manifestAsset || !apkAsset) return null
  const manifestResponse = await fetch(manifestAsset.browser_download_url)
  if (!manifestResponse.ok) return null
  const manifest = (await manifestResponse.json()) as { versionCode?: number; versionName?: string }
  const nextCode = Number(manifest.versionCode) || 0
  if (nextCode <= current.versionCode) return null
  return {
    versionCode: nextCode,
    versionName: manifest.versionName || release.tag_name || String(nextCode),
    currentVersionName: current.versionName,
    url: apkAsset.browser_download_url,
    notes: (release.body || '').slice(0, 500),
  }
}

export async function installUpdate(url: string): Promise<void> {
  await AppUpdater.downloadAndInstall({ url })
}

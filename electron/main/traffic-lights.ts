import { createRequire } from 'node:module'
import path from 'node:path'
import type { BrowserWindow } from 'electron'
import { MAC_TRAFFIC_LIGHT, MAC_TRAFFIC_LIGHT_GAP } from './window-chrome'

const require = createRequire(import.meta.url)
const RETRY_MS = [0, 50, 160]

type PlaceTrafficLights = (view: bigint, originX: number, gap: number) => void

let place: PlaceTrafficLights | null = null
let unavailable = false

export function trafficLightLibraryPath(input: {
  packaged: boolean
  appRoot: string
  resourcesPath: string
}): string {
  if (input.packaged) return path.join(input.resourcesPath, 'traffic-lights.dylib')
  return path.join(input.appRoot, 'native/macos/traffic-lights.dylib')
}

function loadPlace(libraryPath: string): PlaceTrafficLights | null {
  if (place || unavailable) return place
  try {
    const koffi = require('koffi') as {
      load: (file: string) => {
        func: (definition: string) => PlaceTrafficLights
      }
    }
    place = koffi
      .load(libraryPath)
      .func('void stackferry_place_traffic_lights(uint64_t view, double origin_x, double gap)')
    return place
  } catch (error) {
    unavailable = true
    console.error(error)
    return null
  }
}

export function placeWindowTrafficLights(win: BrowserWindow, libraryPath: string): void {
  const placeLights = loadPlace(libraryPath)
  if (!placeLights || win.isDestroyed()) return
  const handle = win.getNativeWindowHandle()
  placeLights(handle.readBigUInt64LE(0), MAC_TRAFFIC_LIGHT.x, MAC_TRAFFIC_LIGHT_GAP)
}

export function bindTrafficLights(win: BrowserWindow, libraryPath: string): void {
  if (process.platform !== 'darwin') return
  let timers: ReturnType<typeof setTimeout>[] = []
  const run = () => {
    for (const timer of timers) clearTimeout(timer)
    timers = RETRY_MS.map((delay) =>
      setTimeout(() => {
        if (win.isDestroyed() || win.isFullScreen()) return
        placeWindowTrafficLights(win, libraryPath)
      }, delay),
    )
  }
  win.on('show', run)
  win.on('resize', run)
  win.on('maximize', run)
  win.on('unmaximize', run)
  win.on('leave-full-screen', run)
  run()
}

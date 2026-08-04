import { contextBridge, ipcRenderer } from 'electron'
import type { ManualState, OverlayState } from '@shared/gsi-types'
import { IPC } from '@shared/ipc'
import type { WidgetId } from '@shared/widgets'
import type { SetupStatus } from '../main/gsi-config'
import type { Settings } from '../main/store'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  onState: (cb: (state: OverlayState) => void) => subscribe(IPC.state, cb),
  onManual: (cb: (manual: ManualState) => void) => subscribe(IPC.manual, cb),
  onSettings: (cb: (settings: Settings) => void) => subscribe(IPC.settings, cb),
  onSetup: (cb: (setup: SetupStatus) => void) => subscribe(IPC.setup, cb),
  onReposition: (cb: (on: boolean) => void) => subscribe(IPC.reposition, cb),
  onHidden: (cb: (hidden: boolean) => void) => subscribe(IPC.hidden, cb),

  ready: () => ipcRenderer.send(IPC.ready),
  moveWidget: (id: WidgetId, x: number, y: number) => ipcRenderer.send(IPC.moveWidget, id, x, y),
  exitEdit: () => ipcRenderer.send(IPC.exitEdit)
}

contextBridge.exposeInMainWorld('overlay', api)

export type OverlayApi = typeof api

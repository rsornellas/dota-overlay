/** IPC channel names, shared between main, preload and renderer. */
export const IPC = {
  /** main → renderer */
  state: 'overlay:state',
  manual: 'overlay:manual',
  settings: 'overlay:settings',
  setup: 'overlay:setup',
  reposition: 'overlay:reposition',
  hidden: 'overlay:hidden',

  /**
   * renderer → main
   *
   * Deliberately short: settings, marks and the data folder belong to the tray
   * menu. The renderer only reports what it alone knows — that it is ready,
   * where a widget was dropped, and that the user pressed Esc.
   */
  ready: 'overlay:ready',
  moveWidget: 'overlay:move-widget',
  exitEdit: 'overlay:exit-edit'
} as const

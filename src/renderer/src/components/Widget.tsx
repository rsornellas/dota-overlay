import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { WIDGET_LABELS, type WidgetId, type WidgetState } from '@shared/widgets'

interface WidgetProps {
  id: WidgetId
  state: WidgetState
  editing: boolean
  children: ReactNode
}

/** Minimum slice left on screen: you can always grab the widget back. */
const EDGE = 60

/**
 * A positionable block. Outside edit mode it is just an absolute container;
 * inside it, it grows a handle and responds to dragging.
 *
 * The position only reaches disk when the drag ends — sending every pixel over
 * IPC would rewrite the config file hundreds of times a second.
 */
export function Widget({ id, state, editing, children }: WidgetProps) {
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null)
  const grabOffset = useRef({ x: 0, y: 0 })

  const position = dragging ?? state

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editing) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    grabOffset.current = { x: event.clientX - state.x, y: event.clientY - state.y }
    setDragging({ x: state.x, y: state.y })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging({
      x: clamp(event.clientX - grabOffset.current.x, window.innerWidth - EDGE),
      y: clamp(event.clientY - grabOffset.current.y, window.innerHeight - EDGE)
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    window.overlay.moveWidget(id, Math.round(dragging.x), Math.round(dragging.y))
    setDragging(null)
  }

  return (
    <div
      className={`widget${editing ? ' widget--editing' : ''}${dragging ? ' widget--dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-widget={id}
    >
      {editing && <div className="widget__handle">{WIDGET_LABELS[id]}</div>}
      {children}
    </div>
  )
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(0, value), Math.max(0, max))
}

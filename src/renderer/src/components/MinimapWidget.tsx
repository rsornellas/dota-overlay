import { ghostOpacity, toMapFraction, type TrackedHero } from '@shared/minimap'

interface MinimapWidgetProps {
  enemies: TrackedHero[]
  self: { x: number; y: number } | null
  clock: number
  editing: boolean
}

/**
 * Enemy tracker.
 *
 * Each marker is an enemy hero YOU HAVE SEEN. Solid = visible now; faded with
 * a counter = last known position, and how many seconds ago. Valve already
 * filters this data by your vision (see shared/minimap.ts), so nothing here
 * reveals fog.
 *
 * The background is a schematic of the map, not the game's art: nothing is
 * downloaded and no Dota files are read.
 */
export function MinimapWidget({ enemies, self, clock, editing }: MinimapWidgetProps) {
  if (enemies.length === 0 && !self && !editing) return null

  return (
    <div className="card minimap">
      <div className="minimap__frame">
        <MapBackground />

        {self && <Marker fraction={toMapFraction(self.x, self.y)} className="pin pin--self" />}

        {enemies.map((hero) => {
          const age = Math.max(0, Math.round(clock - hero.lastSeen))

          return (
            <Marker
              key={hero.unitname}
              fraction={toMapFraction(hero.x, hero.y)}
              className={`pin pin--enemy${hero.visible ? ' pin--live' : ''}`}
              style={{ opacity: ghostOpacity(hero, clock) }}
              title={hero.unitname.replace('npc_dota_hero_', '')}
            >
              <span className="pin__name">{hero.short}</span>
              {!hero.visible && <span className="pin__age">{age}s</span>}
            </Marker>
          )
        })}
      </div>

      {enemies.length === 0 && (
        <p className="minimap__hint">
          {editing ? 'Spotted enemies show up here' : 'No enemies spotted yet'}
        </p>
      )}
    </div>
  )
}

function Marker({
  fraction,
  className,
  style,
  title,
  children
}: {
  fraction: { left: number; top: number }
  className: string
  style?: React.CSSProperties
  title?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={className}
      title={title}
      style={{ left: `${fraction.left * 100}%`, top: `${fraction.top * 100}%`, ...style }}
    >
      {children}
    </div>
  )
}

/**
 * Map schematic: Radiant bottom-left, Dire top-right, river on the diagonal.
 * Enough to place a dot — it is not the game's art.
 */
function MapBackground() {
  return (
    <svg
      className="minimap__bg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Team halves, split by the river */}
      <polygon points="0,0 100,100 0,100" fill="#1d2a1c" />
      <polygon points="0,0 100,0 100,100" fill="#2a1c1c" />

      {/* River, along the anti-diagonal */}
      <line x1="0" y1="0" x2="100" y2="100" stroke="#2f4f63" strokeWidth="7" />

      {/* Lanes: top, mid and bottom */}
      <g stroke="#4a4a44" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 8 88 L 8 12 L 88 12" />
        <path d="M 12 88 L 88 12" />
        <path d="M 12 92 L 88 92 L 88 16" />
      </g>

      {/* Bases */}
      <circle cx="8" cy="92" r="4" fill="#3f6b34" />
      <circle cx="92" cy="8" r="4" fill="#8c3a2c" />
    </svg>
  )
}

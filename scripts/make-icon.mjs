/**
 * Generates the app icons without depending on any image library: the PNGs are
 * assembled by hand with zlib, and packed into the .ico Windows installers
 * require.
 *
 *   node scripts/make-icon.mjs
 *
 * Produces:
 *   build/tray.png  32px  — tray icon
 *   build/icon.png  256px — used by electron-builder
 *   build/icon.ico        — 16/24/32/48/64/128/256, required by NSIS
 *
 * Only needs rerunning if you want to change the drawing.
 */

import { crc32, deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Supersampling: we sample 4x per axis and downscale, which smooths edges. */
const SS = 4

const RING = [0xc2, 0x3c, 0x2a] // Dota red
const FACE = [0x14, 0x16, 0x1a] // near black, to contrast against the game
const HAND = [0xe8, 0xb4, 0x4a] // gold

/**
 * Colour of one point of the drawing: a simple clock.
 * The geometry is written on a 32x32 grid and scaled to the requested size, so
 * the drawing is identical at any resolution.
 */
function sample(x, y, size) {
  const scale = 32 / size
  const dx = x * scale - 16
  const dy = y * scale - 16
  const dist = Math.hypot(dx, dy)

  if (dist > 15) return null // outside the icon: transparent

  // One hand pointing up and another to the right (clock reading 3 o'clock).
  const onVertical = Math.abs(dx) <= 1.1 && dy <= 0 && dy >= -9
  const onHorizontal = Math.abs(dy) <= 1.1 && dx >= 0 && dx <= 6.5
  if (dist < 11 && (onVertical || onHorizontal)) return HAND

  return dist > 11 ? RING : FACE
}

function renderPixels(size) {
  // RGBA, one row at a time, with filter byte 0 in front of each scanline.
  const raw = Buffer.alloc(size * (1 + size * 4))

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter None

    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const color = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size)
          if (!color) continue
          r += color[0]
          g += color[1]
          b += color[2]
          hits++
        }
      }

      if (hits === 0) continue // leave transparent

      const offset = rowStart + 1 + x * 4
      raw[offset] = Math.round(r / hits)
      raw[offset + 1] = Math.round(g / hits)
      raw[offset + 2] = Math.round(b / hits)
      raw[offset + 3] = Math.round((hits / (SS * SS)) * 255)
    }
  }

  return raw
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, checksum])
}

function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // bytes 10..12 (compression, filter, interlace) stay at 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(renderPixels(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * An .ico is a header, a directory and the image blocks in sequence. Since
 * Vista the blocks may be whole PNGs, which is what we use here.
 */
function ico(sizes) {
  const images = sizes.map((size) => ({ size, data: png(size) }))

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  // Image data starts right after the header and the directory.
  let offset = header.length + directory.length

  images.forEach((image, i) => {
    const entry = i * 16
    // 0 means 256: the field is only one byte wide.
    directory[entry] = image.size === 256 ? 0 : image.size
    directory[entry + 1] = image.size === 256 ? 0 : image.size
    directory[entry + 2] = 0 // palette colours (0 = no palette)
    directory[entry + 3] = 0 // reserved
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, directory, ...images.map((i) => i.data)])
}

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
mkdirSync(buildDir, { recursive: true })

const outputs = [
  ['tray.png', png(32)],
  ['icon.png', png(256)],
  ['icon.ico', ico([16, 24, 32, 48, 64, 128, 256])]
]

for (const [name, data] of outputs) {
  writeFileSync(join(buildDir, name), data)
  console.log(`${name.padEnd(9)} ${String(data.length).padStart(7)} bytes`)
}

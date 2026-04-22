// 트레이용 256x256 PNG 아이콘 생성 (Node.js 내장 zlib 압축)
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync as zlibDeflateSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 최소 PNG: 32×32 인디고(#6366f1) 원
function makePng(size, r, g, b) {
  const pixels = []
  const cx = size / 2, cy = size / 2, radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    pixels.push(0) // filter type
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const alpha = dist < radius ? 255 : 0
      pixels.push(r, g, b, alpha)
    }
  }

  const raw = Buffer.from(pixels)
  const deflated = zlibDeflateSync(raw, { level: 9 })

  const ihdrData = Buffer.allocUnsafe(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8; ihdrData[9] = 6; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0
  const ihdr = chunk('IHDR', ihdrData)
  const idat = chunk('IDAT', deflated)
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    ihdr, idat, iend
  ])
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const crcBuf = Buffer.concat([t, data])
  const crc = Buffer.alloc(4); crc.writeInt32BE(crc32(crcBuf))
  return Buffer.concat([len, t, data, crc])
}

function crc32(buf) {
  let c = 0xFFFFFFFF
  const table = makeCrcTable()
  for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) | 0
}

function makeCrcTable() {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}


const outPath = join(__dirname, '../resources/icon.png')
mkdirSync(join(__dirname, '../resources'), { recursive: true })
writeFileSync(outPath, makePng(256, 99, 102, 241))
console.log('아이콘 생성 완료 (256x256):', outPath)

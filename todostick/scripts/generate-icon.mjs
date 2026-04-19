// 트레이용 32x32 PNG 아이콘 생성 (의존성 없음)
import { writeFileSync, mkdirSync } from 'fs'
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
  const deflated = deflateSync(raw)

  const ihdr = chunk('IHDR', Buffer.from([
    0,0,0,size, 0,0,0,size, 8, 6, 0, 0, 0
  ]))
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

function deflateSync(buf) {
  // zlib 없이 무압축 deflate (store only)
  const blockSize = 65535
  const blocks = []
  for (let i = 0; i < buf.length; i += blockSize) {
    const block = buf.slice(i, i + blockSize)
    const last = i + blockSize >= buf.length ? 1 : 0
    const blen = Buffer.alloc(2); blen.writeUInt16LE(block.length)
    const nlen = Buffer.alloc(2); nlen.writeUInt16LE(~block.length & 0xFFFF)
    blocks.push(Buffer.from([last]), blen, nlen, block)
  }
  const deflated = Buffer.concat(blocks)

  // adler32
  let s1 = 1, s2 = 0
  for (const b of buf) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521 }
  const adler = Buffer.alloc(4); adler.writeUInt32BE((s2 << 16) | s1)

  return Buffer.concat([Buffer.from([0x78, 0x01]), deflated, adler])
}

const outPath = join(__dirname, '../resources/icon.png')
mkdirSync(join(__dirname, '../resources'), { recursive: true })
writeFileSync(outPath, makePng(32, 99, 102, 241))
console.log('아이콘 생성 완료:', outPath)

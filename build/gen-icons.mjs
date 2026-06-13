// build/icon.svg → icon.png(512) + icon.ico(멀티 해상도) 생성 스크립트.
// 실행: node build/gen-icons.mjs  (sharp, png-to-ico 필요)
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(dir, 'icon.svg'))

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()

// Linux/공용 512px PNG
writeFileSync(join(dir, 'icon.png'), await png(512))

// Windows .ico (16~256 멀티 해상도)
const sizes = [16, 24, 32, 48, 64, 128, 256]
const buffers = await Promise.all(sizes.map(png))
writeFileSync(join(dir, 'icon.ico'), await pngToIco(buffers))

console.log('생성 완료: icon.png (512), icon.ico (' + sizes.join('/') + ')')

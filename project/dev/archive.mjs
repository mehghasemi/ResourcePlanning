import {deflateRawSync, inflateRawSync} from 'node:zlib'

const crcTable = Array.from({length: 256}, (_, value) => {
  let entry = value
  for (let bit = 0; bit < 8; bit++) entry = entry & 1 ? 0xedb88320 ^ (entry >>> 1) : entry >>> 1
  return entry >>> 0
})
export function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

export function developmentPath(value) {
  if (typeof value !== 'string' || value.length > 500 || value.includes('\\') || !value || value.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))) {
    throw Object.assign(Error('مسیر فایل در بسته معتبر نیست.'), {status: 400})
  }
  return value
}

export function createDevelopmentZip(files) {
  const locals = [], central = [], seen = new Set()
  let offset = 0
  for (const [file, value] of files) {
    developmentPath(file)
    if (seen.has(file.toLowerCase())) throw Error('Duplicate ZIP path')
    seen.add(file.toLowerCase())
    const name = Buffer.from(file), bytes = Buffer.from(value), compressed = deflateRawSync(bytes)
    const header = Buffer.alloc(30), entry = Buffer.alloc(46), crc = crc32(bytes)
    header.writeUInt32LE(0x04034b50)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x800, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(compressed.length, 18)
    header.writeUInt32LE(bytes.length, 22)
    header.writeUInt16LE(name.length, 26)
    entry.writeUInt32LE(0x02014b50)
    entry.writeUInt16LE(20, 4)
    header.copy(entry, 6, 4, 26)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    locals.push(header, name, compressed)
    central.push(entry, name)
    offset += header.length + name.length + compressed.length
  }
  if (seen.size > 65534) throw Error('Too many ZIP entries')
  const directory = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(seen.size, 8)
  end.writeUInt16LE(seen.size, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export function readDevelopmentZip(bytes, {maxBytes = 64 * 1024 * 1024, maxExpanded = 150 * 1024 * 1024, maxFile = 30 * 1024 * 1024, maxFiles = 6000} = {}) {
  const fail = () => { throw Object.assign(Error('ساختار ZIP معتبر نیست یا از ظرفیت مجاز عبور کرده است.'), {status: 400}) }
  if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes || bytes.length < 22) fail()
  let end = -1
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
    if (bytes.readUInt32LE(index) === 0x06054b50 && index + 22 + bytes.readUInt16LE(index + 20) === bytes.length) { end = index; break }
  }
  if (end < 0 || bytes.readUInt32LE(end + 4) !== 0) fail()
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16)
  if (count !== bytes.readUInt16LE(end + 8) || count > maxFiles || count === 65535 || start + size !== end) fail()
  const result = new Map(), seen = new Set(), ranges = [], decoder = new TextDecoder('utf-8', {fatal: true})
  let cursor = start, expanded = 0
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail()
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10)
    const compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32)
    const position = bytes.readUInt32LE(cursor + 42), unixMode = bytes.readUInt32LE(cursor + 38) >>> 16
    if (flags & ~0x808 || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34) || (unixMode & 0xf000) === 0xa000 || cursor + 46 + nameLength + extra + comment > end || length > maxFile || (expanded += length) > maxExpanded) fail()
    let file
    try { file = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)) } catch { fail() }
    const directory = file.endsWith('/')
    developmentPath(directory ? file.slice(0, -1) : file)
    if (seen.has(file.toLowerCase())) fail()
    seen.add(file.toLowerCase())
    if (position + 30 > start || bytes.readUInt32LE(position) !== 0x04034b50 || bytes.readUInt16LE(position + 6) !== flags || bytes.readUInt16LE(position + 8) !== method) fail()
    const localName = bytes.readUInt16LE(position + 26), localExtra = bytes.readUInt16LE(position + 28)
    const payload = position + 30 + localName + localExtra, finish = payload + compressed
    if (finish > start || !bytes.subarray(position + 30, position + 30 + localName).equals(bytes.subarray(cursor + 46, cursor + 46 + nameLength))) fail()
    if (!(flags & 8) && (bytes.readUInt32LE(position + 18) !== compressed || bytes.readUInt32LE(position + 22) !== length || bytes.readUInt32LE(position + 14) !== bytes.readUInt32LE(cursor + 16))) fail()
    ranges.push([position, finish])
    let content
    try { content = method === 0 ? Buffer.from(bytes.subarray(payload, finish)) : inflateRawSync(bytes.subarray(payload, finish), {maxOutputLength: Math.max(1, length)}) } catch { fail() }
    if (content.length !== length || crc32(content) !== bytes.readUInt32LE(cursor + 16)) fail()
    if (directory) { if (length) fail() } else result.set(file, content)
    cursor += 46 + nameLength + extra + comment
  }
  if (cursor !== end) fail()
  ranges.sort((left, right) => left[0] - right[0])
  for (let index = 1; index < ranges.length; index++) if (ranges[index][0] < ranges[index - 1][1]) fail()
  const lowerFiles=new Set([...result.keys()].map(file=>file.toLowerCase()))
  for(const file of seen)if(file.endsWith('/')&&lowerFiles.has(file.slice(0,-1)))fail()
  for (const file of lowerFiles) {
    const parts = file.split('/')
    parts.pop()
    while (parts.length) { if (lowerFiles.has(parts.join('/'))) fail(); parts.pop() }
  }
  return result
}

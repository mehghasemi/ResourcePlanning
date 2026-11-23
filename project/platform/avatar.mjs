export function validateAvatar(value){
  if(value===null)return null
  if(typeof value!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Object.assign(new Error('عکس پروفایل معتبر نیست.'),{status:400})
  const bytes=Buffer.from(value.slice(value.indexOf(',')+1),'base64');if(bytes.length>100000||bytes[0]!==255||bytes[1]!==216)throw Object.assign(new Error('عکس پروفایل بیش از حد بزرگ یا نامعتبر است.'),{status:400})
  let offset=2,dimensions=null
  while(offset+4<bytes.length){if(bytes[offset]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;if([192,193,194].includes(marker)&&length>=8){dimensions={height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};break}offset+=length}
  if(!dimensions||Math.min(dimensions.width,dimensions.height)<1||Math.max(dimensions.width,dimensions.height)>512)throw Object.assign(new Error('ابعاد عکس پروفایل معتبر نیست.'),{status:400})
  return 'data:image/jpeg;base64,'+bytes.toString('base64')
}

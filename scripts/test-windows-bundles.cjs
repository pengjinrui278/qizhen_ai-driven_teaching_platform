const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {crc32,build}=require('./build-windows-helper.cjs');
const root=path.resolve(__dirname,'../apps/web/public/downloads/windows');
build();
test('CRC32 known vector',()=>assert.equal(crc32(Buffer.from('123456789')),0xcbf43926));
test('15 unique bundles, valid members, BOM and selections',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 assert.equal(Object.keys(manifest.packages).length,15);
 for(const[key,entry]of Object.entries(manifest.packages)){
  const data=fs.readFileSync(path.join(root,entry.file));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);
  let offset=0;const members={};
  while(data.readUInt32LE(offset)===0x04034b50){
   const length=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26),extraLength=data.readUInt16LE(offset+28);
   const name=data.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extraLength,body=data.subarray(start,start+length);
   assert.equal(crc32(body),data.readUInt32LE(offset+14));assert.ok(!name.includes('/')&&!name.includes('..'));members[name]=body;offset=start+length;
  }
  assert.equal(Object.keys(members).length,7);
  assert.equal(JSON.parse(members['selection.json']).join('-'),key);
  for(const file of ['Helper.ps1','Core.ps1','Worker.ps1'])assert.equal(members[file].subarray(0,3).toString('hex'),'efbbbf');
  assert.ok(!data.includes(Buffer.from('MIRROR_LLM_API_KEY')));
 }
});

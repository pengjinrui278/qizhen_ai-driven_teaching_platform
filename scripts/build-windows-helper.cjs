// Cross-platform, deterministic ZIP packaging. Never downloads or executes installers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'apps/windows-helper'),out=path.join(root,'apps/web/public/downloads/windows');
const catalog=JSON.parse(fs.readFileSync(path.join(source,'catalog.json'),'utf8'));
const files=['Start.cmd','Helper.ps1','Core.ps1','Worker.ps1','catalog.json','README.txt'];
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(entries){
 const blocks=[],central=[];let offset=0;
 for(const [name,data]of entries){
  const filename=Buffer.from(name),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  blocks.push(local,filename,data);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(33,14);
  entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);central.push(entry,filename);
  offset+=local.length+filename.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...blocks,directory,end]);
}
function build(){
 fs.mkdirSync(out,{recursive:true});
 const common=files.map(name=>{let content=fs.readFileSync(path.join(source,name),'utf8').replace(/^\uFEFF/,'').replace(/\r?\n/g,'\r\n');if(name.endsWith('.ps1'))content='\uFEFF'+content;return [name,Buffer.from(content)];});
 const packages={};
 for(let mask=1;mask<(1<<catalog.length);mask++){
  const selected=catalog.filter((_,i)=>mask&(1<<i)).map(t=>t.key),key=selected.join('-'),file='learning-mirror-windows-'+key+'.zip';
  const archive=zip([...common,['selection.json',Buffer.from(JSON.stringify(selected))]]);
  fs.writeFileSync(path.join(out,file),archive);
  packages[key]={file,sha256:crypto.createHash('sha256').update(archive).digest('hex'),bytes:archive.length};
 }
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:'0.1.0',packages},null,2));
 console.log('Windows helper: '+Object.keys(packages).length+' selection bundles built');
}
if(require.main===module)build();
module.exports={zip,crc32,build};

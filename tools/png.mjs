import fs from 'fs'; import zlib from 'zlib';
export function decode(path){const buf=fs.readFileSync(path);let p=8,idat=[],w,h;
while(p<buf.length){const len=buf.readUInt32BE(p);const t=buf.toString('ascii',p+4,p+8);const d=buf.subarray(p+8,p+8+len);
if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);var ct=d[9];} if(t==='IDAT')idat.push(d); p+=12+len;}
const raw=zlib.inflateSync(Buffer.concat(idat)); const bpp=ct===2?3:4, stride=w*bpp; const out=Buffer.alloc(h*stride);
for(let y=0;y<h;y++){const f=raw[y*(stride+1)];const line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
for(let x=0;x<stride;x++){const a=x>=bpp?out[y*stride+x-bpp]:0,b=y?out[(y-1)*stride+x]:0,c=(x>=bpp&&y)?out[(y-1)*stride+x-bpp]:0;let v=line[x];
if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}out[y*stride+x]=v&255;}}
if(bpp===3){const o=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){o[i*4]=out[i*3];o[i*4+1]=out[i*3+1];o[i*4+2]=out[i*3+2];o[i*4+3]=255;}return {w,h,data:o};}
return {w,h,data:new Uint8ClampedArray(out)};}
const crcT=new Int32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c;});
const crc=b=>{let c=-1;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^-1)>>>0;};
export function encode(path,w,h,rgba){const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;Buffer.from(rgba.buffer,rgba.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1);}
fs.writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}

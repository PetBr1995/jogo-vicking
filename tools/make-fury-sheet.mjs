// Turns the painted fury rows (docs/arte/fury-pintada/*.png, 6 frames each, on a
// flat navy background) into game cells: background removed, frames cut at the
// empty gaps between them, scaled to the Base viking's size and aligned so the
// feet sit on the sheet anchor (x=112, y=196).
//
//   node tools/make-fury-sheet.mjs
//
// Output: public/assets/viking-fury.png (1344 x 224 per row) + viking-fury.json
//   rows: idle, run, jump, attack (the order of ROWS below)

import fs from 'fs';
import { decode, encode } from './png.mjs';
import { fileURLToPath } from 'url';
const SRC = fileURLToPath(new URL('../docs/arte/fury-pintada/', import.meta.url));
const OUT = fileURLToPath(new URL('../public/assets/', import.meta.url));
const ROWS = [['idle','idle'],['run','run'],['jump','jump'],['attack','attack'],['attackSpin','spin'],['attackOverhead','overhead'],['attackPlunge','plunge'],['throw','throw']];
// frames whose effect crosses the automatic cut: { row: { cutIndex: sourceX } }
// (attack: the fire arc of frame 3 reaches x=574, the next frame starts at x~590)
const CUT_FIX = { attack: { 3: 580 } };
// leftovers of a neighbor frame that the automatic cleaning keeps: { row: { frame: [[x0,y0,x1,y1]] } } in cell px
const ERASE = { attack: { 2: [[174, 130, 224, 172]] } }; // only the dark pieces (outlines, shadows), not the fire
const SCALE = 0.61, C = 224, AX = 112, AY = 196, N = 6;
const out = new Uint8ClampedArray(C*N*C*ROWS.length*4);
const W = C*N;
const report = [];
ROWS.forEach(([name,file], r) => {
  const g = decode(SRC+file+'.png'); const w=g.w,h=g.h, d=g.data;
  const bg=[30,32,57];
  const dist=(i)=>Math.hypot(d[i]-bg[0],d[i+1]-bg[1],d[i+2]-bg[2]);
  // flood outside
  const R=new Uint8Array(w*h), st=[];
  for(let x=0;x<w;x++){st.push(x,(h-1)*w+x)} for(let y=0;y<h;y++){st.push(y*w,y*w+w-1)}
  while(st.length){const k=st.pop(); if(R[k]||dist(k*4)>14)continue; R[k]=1; const x=k%w,y=(k/w)|0;
    if(x>0)st.push(k-1); if(x<w-1)st.push(k+1); if(y>0)st.push(k-w); if(y<h-1)st.push(k+w);}
  // distance to R (cheap: dilate 20 times)
  let near=R.slice(); const nearD=new Uint8Array(w*h); 
  for(let it=1;it<=20;it++){const nx=near.slice();for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=y*w+x;if(!near[k]&&(near[k-1]||near[k+1]||near[k-w]||near[k+w])){nx[k]=1;nearD[k]=it}}near=nx;}
  const A=new Float32Array(w*h), col=new Float32Array(w*h*3);
  for(let k=0;k<w*h;k++){const i=k*4; let a=1, c=[d[i],d[i+1],d[i+2]];
    if(R[k]) a=0;
    else if(nearD[k]>0 && d[i]-bg[0]>8 && d[i]>d[i+2]+10){
      a=Math.min(1,Math.pow(Math.max(0,(d[i]-bg[0])/170),0.8));
      if(a>0.02) c=c.map((v,j)=>Math.max(0,Math.min(255,(v-bg[j]*(1-a))/a)));
    }
    A[k]=a; col[k*3]=c[0];col[k*3+1]=c[1];col[k*3+2]=c[2];}
  // per-frame feet (dark boots) bottom and center x
  const cw=w/N; const feet=[];
  const colOcc=new Float32Array(w); for(let x=0;x<w;x++){let c=0;for(let y=0;y<h;y++)if(!R[y*w+x])c+=A[y*w+x];colOcc[x]=c;}
  const cuts=[0]; for(let k=1;k<N;k++){let best=Math.round(k*cw),bv=1e9;for(let x=Math.round(k*cw-34);x<=Math.round(k*cw+34);x++){let v=0;for(let q=-2;q<=2;q++)v+=colOcc[x+q];v+=Math.abs(x-k*cw)*0.6;if(v<bv){bv=v;best=x}}cuts.push(best);} cuts.push(w); for (const [k, x] of Object.entries(CUT_FIX[name] || {})) cuts[k] = x;
  // each frame's own alpha: only what belongs to it. Pieces of a neighbor that
  // reach into this window (they touch the cut and are not the main shape)
  // are dropped, and the soft glow fades out before the cut so nothing ends in a hard edge.
  const AF = [];
  for (let f = 0; f < N; f++) {
    const x0 = cuts[f], x1 = cuts[f + 1], af = new Float32Array(w * h);
    const lab = new Int32Array(w * h), comps = [];
    for (let s0 = 0; s0 < w * h; s0++) {
      const sx0 = s0 % w; if (sx0 < x0 || sx0 >= x1 || A[s0] < 0.04 || lab[s0]) continue;
      const id = comps.length + 1, stk = [s0]; lab[s0] = id; let area = 0, touches = false, nearCut = false;
      while (stk.length) {
        const k = stk.pop(); area++; const x = k % w, y = (k / w) | 0;
        if ((x === x0 && f > 0) || (x === x1 - 1 && f < N - 1)) touches = true;
        if ((f > 0 && x - x0 < 30) || (f < N - 1 && x1 - 1 - x < 30)) nearCut = true;
        for (const q of [x > x0 ? k - 1 : -1, x < x1 - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) if (q >= 0 && A[q] >= 0.04 && !lab[q]) { lab[q] = id; stk.push(q); }
      }
      comps.push({ id, area, touches: touches || (nearCut && area < 500) });
    }
    const big = comps.reduce((m, c) => (c.area > (m?.area || 0) ? c : m), null);
    const keep = new Set(comps.filter((c) => c === big || !c.touches).map((c) => c.id));
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
      const k = y * w + x; if (!lab[k] || !keep.has(lab[k])) continue;
      let fade = 1;
      if (f > 0) fade = Math.min(fade, (x - x0) / 8);
      if (f < N - 1) fade = Math.min(fade, (x1 - 1 - x) / 8);
      af[k] = A[k] * Math.max(0, Math.min(1, fade));
    }
    AF.push(af);
  }
  for(let f=0;f<N;f++){let by=0; let sx=0,sn=0;
    const x0=Math.round(cuts[f]+(cuts[f+1]-cuts[f])*0.2),x1=Math.round(cuts[f]+(cuts[f+1]-cuts[f])*0.8);
    for(let y=0;y<h;y++)for(let x=x0;x<x1;x++){const k=y*w+x;const i=k*4;if(!R[k]&&Math.max(d[i],d[i+1],d[i+2])<70&&d[i]<=d[i+2]+30&&A[k]>0.9){if(y>by)by=y}}
    for(let y=by-18;y<=by;y++)for(let x=x0;x<x1;x++){const k=y*w+x;const i=k*4;if(!R[k]&&Math.max(d[i],d[i+1],d[i+2])<70&&A[k]>0.9){sx+=x;sn++}}
    feet.push({by,cx:sn?sx/sn:(f+0.5)*cw});}
  const bys=feet.map(f=>f.by).sort((a,b)=>a-b); const baseY=bys[Math.floor(N/2)];
  report.push([name,feet.map(f=>`${f.by}/${Math.round(f.cx-f_(f,cw))}`).join(' '),baseY]);
  function f_(f,cw){return 0}
  for(let f=0;f<N;f++){
    const fy = name==='jump' ? feet[0].by : baseY; // jump keeps one ground level
    const cx = feet[f].cx;
    for(let y=0;y<C;y++)for(let x=0;x<C;x++){
      // source position for this dest pixel (supersample 2x2)
      let pa=0,pr=0,pg=0,pb=0;
      for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
        const u=cx+((x+(sx+.5)/2)-AX)/SCALE, v=fy+((y+(sy+.5)/2)-AY)/SCALE;
        const ix=Math.floor(u), iy=Math.floor(v); if(ix<cuts[f]||ix>=cuts[f+1]||iy<0||iy>=h)continue;
        const k=iy*w+ix, a=AF[f][k]; pa+=a; pr+=col[k*3]*a; pg+=col[k*3+1]*a; pb+=col[k*3+2]*a;}
      if(pa>0){const o=((r*C+y)*W+f*C+x)*4; out[o]=pr/pa;out[o+1]=pg/pa;out[o+2]=pb/pa;out[o+3]=Math.min(255,pa/4*255);}
    }
  }
});
for (const [name, fr] of Object.entries(ERASE)) {
  const r = ROWS.findIndex(([n]) => n === name);
  for (const [f, rects] of Object.entries(fr)) for (const [x0, y0, x1, y1] of rects)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = ((r * C + y) * W + f * C + x) * 4; if (out[o] < 130) out[o + 3] = 0; }
}
// no frame may touch the edge of its cell (a cut effect)
for (let r = 0; r < ROWS.length; r++) for (let f = 0; f < N; f++) {
  let hit = 0;
  for (let t = 0; t < C; t++) for (const [x, y] of [[0, t], [C - 1, t], [t, 0], [t, C - 1]]) if (out[((r * C + y) * W + f * C + x) * 4 + 3] > 12) hit++;
  if (hit) console.log(`ATENÇÃO: ${ROWS[r][0]} quadro ${f + 1} encosta na borda (${hit} px)`);
}
encode(OUT+'viking-fury.png',W,C*ROWS.length,out);
fs.writeFileSync(OUT+'viking-fury.json',JSON.stringify({cell:C,rows:Object.fromEntries(ROWS.map(([n],i)=>[n,i]))})+'\n');
console.log('ok: viking-fury.png',W+'x'+C*ROWS.length);

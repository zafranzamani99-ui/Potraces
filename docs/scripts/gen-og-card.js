const zlib = require('zlib');
const fs = require('fs');

const W = 1200, H = 630;
// RGBA buffer
const px = Buffer.alloc(W * H * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  // alpha blend over existing
  const ia = a / 255, na = 1 - ia;
  px[i]   = Math.round(r * ia + px[i] * na);
  px[i+1] = Math.round(g * ia + px[i+1] * na);
  px[i+2] = Math.round(b * ia + px[i+2] * na);
  px[i+3] = 255;
}

// CALM palette
const OLIVE_DEEP = [0x33,0x2D,0x03];
const OLIVE      = [0x4F,0x51,0x04];
const OLIVE_LT   = [0x6B,0x6D,0x1A];
const CREAM      = [0xF1,0xE7,0xD3];
const GOLD       = [0xDE,0xAB,0x22];
const BRONZE     = [0xB2,0x78,0x0A];

// diagonal gradient background olive-deep -> olive -> olive-light (135deg feel)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const tt = (x / W * 0.5 + y / H * 0.5); // 0..1 along diagonal
    let r,g,b;
    if (tt < 0.5) {
      const k = tt / 0.5;
      r = OLIVE_DEEP[0] + (OLIVE[0]-OLIVE_DEEP[0])*k;
      g = OLIVE_DEEP[1] + (OLIVE[1]-OLIVE_DEEP[1])*k;
      b = OLIVE_DEEP[2] + (OLIVE[2]-OLIVE_DEEP[2])*k;
    } else {
      const k = (tt-0.5)/0.5;
      r = OLIVE[0] + (OLIVE_LT[0]-OLIVE[0])*k;
      g = OLIVE[1] + (OLIVE_LT[1]-OLIVE[1])*k;
      b = OLIVE[2] + (OLIVE_LT[2]-OLIVE[2])*k;
    }
    const i = (y*W+x)*4;
    px[i]=Math.round(r); px[i+1]=Math.round(g); px[i+2]=Math.round(b); px[i+3]=255;
  }
}

// soft radial glow top-right (cream, low alpha)
function radial(cx, cy, rad, col, maxA) {
  for (let y = Math.max(0,cy-rad); y < Math.min(H,cy+rad); y++) {
    for (let x = Math.max(0,cx-rad); x < Math.min(W,cx+rad); x++) {
      const d = Math.hypot(x-cx, y-cy);
      if (d > rad) continue;
      const a = Math.round(maxA * (1 - d/rad));
      if (a>0) set(x,y,col[0],col[1],col[2],a);
    }
  }
}
radial(1080, 110, 420, CREAM, 22);
radial(120, 560, 360, GOLD, 16);

// ---- simple 5x7 pixel font for the wordmark + tagline ----
const FONT = {
 'A':["01110","10001","10001","11111","10001","10001","10001"],
 'B':["11110","10001","10001","11110","10001","10001","11110"],
 'C':["01111","10000","10000","10000","10000","10000","01111"],
 'D':["11110","10001","10001","10001","10001","10001","11110"],
 'E':["11111","10000","10000","11110","10000","10000","11111"],
 'F':["11111","10000","10000","11110","10000","10000","10000"],
 'G':["01111","10000","10000","10111","10001","10001","01111"],
 'H':["10001","10001","10001","11111","10001","10001","10001"],
 'I':["11111","00100","00100","00100","00100","00100","11111"],
 'J':["00111","00010","00010","00010","00010","10010","01100"],
 'K':["10001","10010","10100","11000","10100","10010","10001"],
 'L':["10000","10000","10000","10000","10000","10000","11111"],
 'M':["10001","11011","10101","10101","10001","10001","10001"],
 'N':["10001","11001","10101","10011","10001","10001","10001"],
 'O':["01110","10001","10001","10001","10001","10001","01110"],
 'P':["11110","10001","10001","11110","10000","10000","10000"],
 'Q':["01110","10001","10001","10001","10101","10010","01101"],
 'R':["11110","10001","10001","11110","10100","10010","10001"],
 'S':["01111","10000","10000","01110","00001","00001","11110"],
 'T':["11111","00100","00100","00100","00100","00100","00100"],
 'U':["10001","10001","10001","10001","10001","10001","01110"],
 'V':["10001","10001","10001","10001","10001","01010","00100"],
 'W':["10001","10001","10001","10101","10101","11011","10001"],
 'X':["10001","01010","00100","00100","00100","01010","10001"],
 'Y':["10001","01010","00100","00100","00100","00100","00100"],
 'Z':["11111","00010","00100","01000","10000","10000","11111"],
 'a':["00000","00000","01110","00001","01111","10001","01111"],
 'c':["00000","00000","01111","10000","10000","10000","01111"],
 'd':["00001","00001","01111","10001","10001","10001","01111"],
 'e':["00000","00000","01110","10001","11111","10000","01111"],
 'f':["00110","01000","11110","01000","01000","01000","01000"],
 'g':["00000","01111","10001","10001","01111","00001","01110"],
 'h':["10000","10000","11110","10001","10001","10001","10001"],
 'i':["00100","00000","01100","00100","00100","00100","01110"],
 'k':["10000","10000","10010","10100","11000","10100","10010"],
 'l':["01100","00100","00100","00100","00100","00100","01110"],
 'm':["00000","00000","11010","10101","10101","10101","10101"],
 'n':["00000","00000","11110","10001","10001","10001","10001"],
 'o':["00000","00000","01110","10001","10001","10001","01110"],
 'p':["00000","11110","10001","10001","11110","10000","10000"],
 'r':["00000","00000","10110","11000","10000","10000","10000"],
 's':["00000","00000","01111","10000","01110","00001","11110"],
 't':["01000","01000","11110","01000","01000","01001","00110"],
 'u':["00000","00000","10001","10001","10001","10011","01101"],
 'v':["00000","00000","10001","10001","10001","01010","00100"],
 'w':["00000","00000","10001","10001","10101","10101","01010"],
 'y':["00000","10001","10001","01111","00001","00001","01110"],
 ' ':["00000","00000","00000","00000","00000","00000","00000"],
 ',':["00000","00000","00000","00000","00000","00100","01000"],
 '.':["00000","00000","00000","00000","00000","00000","00100"],
 "'":["00100","00100","00000","00000","00000","00000","00000"],
};

function drawText(str, x, y, scale, col, a) {
  let cx = x;
  for (const ch of str) {
    const g = FONT[ch] || FONT[' '];
    for (let ry=0; ry<7; ry++) {
      for (let rx=0; rx<5; rx++) {
        if (g[ry][rx]==='1') {
          for (let sy=0;sy<scale;sy++) for (let sx=0;sx<scale;sx++)
            set(cx+rx*scale+sx, y+ry*scale+sy, col[0],col[1],col[2], a==null?255:a);
        }
      }
    }
    cx += 6*scale; // 5 px glyph + 1 px spacing
  }
  return cx;
}

// gold accent bar (left rail, S3 stripe vibe)
for (let y=250;y<300;y++) for (let x=110;x<118;x++) set(x,y,GOLD[0],GOLD[1],GOLD[2],255);

// wordmark
drawText("Potraces", 140, 248, 11, CREAM, 255);
// tagline lines
drawText("Calm money tracking for", 142, 360, 5, CREAM, 235);
drawText("irregular earners in Malaysia", 142, 410, 5, CREAM, 235);
// small footer
drawText("RM  Bahasa Melayu  Works offline", 142, 500, 4, GOLD, 235);

// ---- encode PNG ----
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t = Buffer.from(type,'ascii');
  const body = Buffer.concat([t,data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)>>>0,0);
  return Buffer.concat([len,body,crc]);
}
function crc32(buf){
  let c=~0;
  for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c = (c>>>1) ^ (0xEDB88320 & -(c&1)); }
  return ~c;
}
const sig = Buffer.from([137,80,78,71,13,10,26,10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
// raw scanlines with filter byte 0
const raw = Buffer.alloc(H*(W*4+1));
for (let y=0;y<H;y++){
  raw[y*(W*4+1)] = 0;
  px.copy(raw, y*(W*4+1)+1, y*W*4, (y+1)*W*4);
}
const idat = zlib.deflateSync(raw, {level:9});
const png = Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync('c:/Project/Potraces/docs/assets/og-card.png', png);
console.log('wrote og-card.png', png.length, 'bytes', W+'x'+H);

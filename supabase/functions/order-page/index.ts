import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug')?.trim();

  if (!slug) {
    return htmlRes(errorPage('Pautan kedai tidak sah. Minta penjual hantar semula pautan.'), 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from('seller_profiles')
    .select('id, user_id, display_name, currency')
    .eq('slug', slug)
    .maybeSingle();

  if (!profile) {
    return htmlRes(errorPage('Kedai tidak dijumpai. Semak semula pautan anda.'), 404);
  }

  const { data: rawProducts } = await admin
    .from('seller_products')
    .select('id, name, price_per_unit, unit')
    .eq('user_id', profile.user_id)
    .eq('is_active', true)
    .order('name');

  const products = (rawProducts ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    price_per_unit: parseFloat(p.price_per_unit),
    unit: p.unit,
  }));

  return htmlRes(shopPage({
    shopName: profile.display_name || slug,
    currency: profile.currency || 'RM',
    sellerId: profile.id,
    products,
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
  }));
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function htmlRes(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Error page ───────────────────────────────────────────────────────────────

function errorPage(msg: string) {
  return `<!DOCTYPE html>
<html lang="ms"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ralat</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F9F9F7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,.08)}
h2{color:#4F5104;font-size:20px;margin-bottom:10px}
p{color:#666;font-size:14px;line-height:1.5}
</style></head><body>
<div class="card"><h2>Oops!</h2><p>${msg}</p></div>
</body></html>`;
}

// ─── Shop page ────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price_per_unit: number;
  unit: string;
}

function shopPage(opts: {
  shopName: string;
  currency: string;
  sellerId: string;
  products: Product[];
  supabaseUrl: string;
  anonKey: string;
}) {
  const { shopName, currency, sellerId, products, supabaseUrl, anonKey } = opts;
  const productsJson = JSON.stringify(products);

  return `<!DOCTYPE html>
<html lang="ms"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${esc(shopName)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#F9F9F7;--white:#fff;--olive:#4F5104;--bronze:#8B7355;--gold:#B2780A;
  --sky:#6BA3BE;--text:#2C2C2C;--text2:#666;--text3:#999;
  --border:#E5E0D8;--border2:#F0EDE8;--err:#C1694F;--r:12px;--rs:8px
}
html,body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}
.wrap{max-width:480px;margin:0 auto;padding-bottom:120px}

/* Header */
.header{background:var(--olive);padding:24px 20px 28px;text-align:center;position:sticky;top:0;z-index:10}
.hdr-sub{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:6px}
.hdr-name{font-size:22px;font-weight:700;color:#fff}

/* Section */
.sec{padding:20px 16px 8px}
.sec-title{font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--bronze);margin-bottom:12px}

/* Products */
.prod-list{display:flex;flex-direction:column;gap:2px}
.prod-card{background:var(--white);border-radius:var(--rs);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.prod-info{flex:1;min-width:0}
.prod-name{font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.prod-price{font-size:13px;color:var(--text2);margin-top:2px}

/* Qty */
.qty-ctrl{display:flex;align-items:center;background:var(--bg);border-radius:var(--rs);overflow:hidden}
.qty-btn{width:36px;height:36px;border:none;background:transparent;color:var(--olive);font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;transition:background .1s}
.qty-btn:active{background:var(--border)}
.qty-val{min-width:28px;text-align:center;font-size:16px;font-weight:600}
.qty-val.z{color:var(--text3)}

/* Form fields */
.field{background:var(--white);border-radius:var(--r);padding:14px 16px;margin-bottom:8px}
.field-label{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--bronze);margin-bottom:6px}
.req{color:var(--gold)}
.field input,.field textarea{width:100%;border:none;outline:none;font-size:16px;color:var(--text);background:transparent;font-family:inherit;resize:none}
.field input::placeholder,.field textarea::placeholder{color:var(--text3)}

/* Cart */
.cart{background:var(--white);border-radius:var(--r);overflow:hidden;margin:0 16px}
.cart-row{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border2)}
.cart-row:last-of-type{border-bottom:none}
.ci-name{font-size:14px}
.ci-sub{font-size:12px;color:var(--text2);margin-top:1px}
.ci-price{font-size:14px;font-weight:600;flex-shrink:0;margin-left:12px}
.cart-empty{padding:24px 16px;text-align:center;color:var(--text3);font-size:14px}
.cart-total{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--olive)}
.total-label{font-size:14px;font-weight:600;color:rgba(255,255,255,.8)}
.total-amt{font-size:18px;font-weight:700;color:#fff}

/* Submit bar */
.bar{position:fixed;bottom:0;left:0;right:0;background:var(--bg);border-top:1px solid var(--border);padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom))}
.submit-btn{width:100%;max-width:480px;display:block;margin:0 auto;background:var(--sky);color:#fff;border:none;border-radius:var(--r);padding:16px;font-size:16px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .15s}
.submit-btn:disabled{background:var(--border);color:var(--text3);cursor:not-allowed}
.submit-btn:not(:disabled):active{opacity:.85}

/* Success */
.success{display:none;min-height:100vh;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;text-align:center}
.success.show{display:flex}
.s-icon{width:72px;height:72px;background:var(--sky);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:24px}
.s-icon svg{width:36px;height:36px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.s-title{font-size:22px;font-weight:700;color:var(--olive);margin-bottom:10px}
.s-text{font-size:15px;color:var(--text2);line-height:1.5;max-width:300px}

/* Error */
.err-box{display:none;background:#FBF0EE;border:1px solid #E8C4BB;border-radius:var(--rs);padding:12px 16px;margin:12px 16px 0;font-size:13px;color:var(--err);line-height:1.4}
.err-box.show{display:block}

/* Divider */
.div{height:1px;background:var(--border);margin:8px 16px}

/* Empty products */
.empty-prods{padding:40px 24px;text-align:center;color:var(--text2);font-size:14px}

/* Spinner */
.spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
</head><body>

<div id="main">
  <div class="header">
    <div class="hdr-sub">Tempah di sini</div>
    <div class="hdr-name">${esc(shopName)}</div>
  </div>
  <div class="wrap">
    <div class="sec">
      <div class="sec-title">Pilih Item</div>
      <div class="prod-list" id="prod-list"></div>
    </div>

    <div class="div"></div>

    <div class="sec">
      <div class="sec-title">Maklumat Anda</div>
      <div class="field">
        <div class="field-label">Nama <span class="req">*</span></div>
        <input id="cname" type="text" placeholder="Nama anda..." autocomplete="name" oninput="updBtn()">
      </div>
      <div class="field">
        <div class="field-label">No. WhatsApp</div>
        <input id="cphone" type="tel" placeholder="01X-XXXXXXX" autocomplete="tel">
        <div style="font-size:11px;color:#888;margin-top:3px;">Masukkan nombor WhatsApp untuk terima pengesahan pesanan</div>
      </div>
      <div class="field">
        <div class="field-label">Nota / Permintaan Khas</div>
        <textarea id="cnote" rows="2" placeholder="Sebarang permintaan..."></textarea>
      </div>
    </div>

    <div class="div"></div>

    <div class="sec">
      <div class="sec-title">Ringkasan Pesanan</div>
    </div>
    <div class="cart" id="cart"></div>
    <div class="err-box" id="err"></div>
  </div>
</div>

<div class="success" id="success">
  <div class="s-icon">
    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
  </div>
  <div class="s-title">Pesanan Dihantar!</div>
  <div class="s-text">Terima kasih. Penjual akan hubungi anda tidak lama lagi.</div>
</div>

<div class="bar" id="bar">
  <button class="submit-btn" id="sbtn" disabled onclick="doSubmit()">Hantar Pesanan</button>
</div>

<script>
var PRODS=${productsJson};
var SELLER_ID='${sellerId}';
var SB_URL='${supabaseUrl}';
var SB_KEY='${anonKey}';
var CUR='${currency}';
var cart={};

function fmt(n){return CUR+' '+n.toFixed(2);}
function total(){return PRODS.reduce(function(s,p){return s+(cart[p.id]||0)*p.price_per_unit;},0);}
function cartItems(){return PRODS.filter(function(p){return (cart[p.id]||0)>0;}).map(function(p){return {p:p,q:cart[p.id],sub:cart[p.id]*p.price_per_unit};});}

function setQty(id,d){
  var n=Math.max(0,(cart[id]||0)+d);
  if(n===0)delete cart[id];else cart[id]=n;
  var qv=document.getElementById('qv-'+id);
  var mb=document.getElementById('mb-'+id);
  if(qv){qv.textContent=n;qv.className='qty-val'+(n===0?' z':'');}
  if(mb){mb.style.opacity=n===0?'0.3':'1';}
  renderCart();updBtn();
}

function escH(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function renderProds(){
  var el=document.getElementById('prod-list');
  if(!PRODS.length){el.innerHTML='<div class="empty-prods">Tiada produk tersedia buat masa ini.</div>';return;}
  el.innerHTML=PRODS.map(function(p){
    return '<div class="prod-card">'+
      '<div class="prod-info">'+
        '<div class="prod-name">'+escH(p.name)+'</div>'+
        '<div class="prod-price">'+fmt(p.price_per_unit)+' / '+escH(p.unit)+'</div>'+
      '</div>'+
      '<div class="qty-ctrl">'+
        '<button class="qty-btn" id="mb-'+p.id+'" style="opacity:.3;color:var(--text2)" onclick="setQty(\''+p.id+'\',-1)" aria-label="Kurang">&#8722;</button>'+
        '<span class="qty-val z" id="qv-'+p.id+'">0</span>'+
        '<button class="qty-btn" onclick="setQty(\''+p.id+'\',1)" aria-label="Tambah">+</button>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderCart(){
  var items=cartItems();var t=total();var el=document.getElementById('cart');
  if(!items.length){el.innerHTML='<div class="cart-empty">Belum ada item dipilih</div>';return;}
  el.innerHTML=items.map(function(x){
    return '<div class="cart-row">'+
      '<div><div class="ci-name">'+escH(x.p.name)+'</div>'+
      '<div class="ci-sub">'+x.q+' '+escH(x.p.unit)+' \xd7 '+fmt(x.p.price_per_unit)+'</div></div>'+
      '<div class="ci-price">'+fmt(x.sub)+'</div>'+
    '</div>';
  }).join('')+
  '<div class="cart-total"><div class="total-label">Jumlah</div><div class="total-amt">'+fmt(t)+'</div></div>';
}

function updBtn(){
  var name=document.getElementById('cname').value.trim();
  document.getElementById('sbtn').disabled=!(cartItems().length>0&&name.length>0);
}

async function doSubmit(){
  var name=document.getElementById('cname').value.trim();
  var phone=document.getElementById('cphone').value.trim();
  var note=document.getElementById('cnote').value.trim();
  var items=cartItems();var t=total();
  if(!name||!items.length)return;
  var btn=document.getElementById('sbtn');
  btn.disabled=true;
  btn.innerHTML='<span class="spin"></span>Menghantar...';
  document.getElementById('err').classList.remove('show');
  try{
    var res=await fetch(SB_URL+'/rest/v1/seller_orders',{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({
        user_id:null,source:'order_link',seller_id:SELLER_ID,
        items:items.map(function(x){return {productId:x.p.id,productName:x.p.name,quantity:x.q,unitPrice:x.p.price_per_unit,unit:x.p.unit};}),
        customer_name:name||null,customer_phone:phone||null,note:note||null,
        total_amount:t,status:'pending',is_paid:false,
      }),
    });
    if(!res.ok){var txt=await res.text();throw new Error(txt||'HTTP '+res.status);}
    document.getElementById('main').style.display='none';
    document.getElementById('bar').style.display='none';
    document.getElementById('success').classList.add('show');
  }catch(err){
    var el=document.getElementById('err');
    el.textContent='Ralat: '+(err.message||'Sila cuba lagi.');
    el.classList.add('show');
    el.scrollIntoView({behavior:'smooth',block:'nearest'});
    btn.disabled=false;btn.textContent='Hantar Pesanan';
  }
}

renderProds();renderCart();
</script>
</body></html>`;
}

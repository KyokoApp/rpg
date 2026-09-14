/* ============================================================
   REGRESI: layar hitam dengan UI tetap terlihat.

   Bug nyata yang pernah terjadi:
     const postOpts = { ..., sunScreen:{x:0.5,y:0.35}, ... };
     ...
     postOpts.sunScreen.set(a, b);      // TypeError tiap frame

   Kenapa berakibat layar hitam (bukan sekadar error di konsol):
   animate() memanggil requestAnimationFrame() di BARIS PERTAMA, jadi
   loop tetap hidup setelah melempar. Akibatnya canvas tidak pernah
   digambar sementara DOM/HUD tetap tampil — pemain melihat layar
   gelap dengan UI lengkap, tanpa petunjuk apa pun.

   Tes ini menutup KELAS bug tersebut: setiap properti yang dipanggil
   .set() padanya harus benar-benar punya method itu (Vector2/Vector3/
   Color), bukan objek polos {x,y}.
   ============================================================ */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const HTML = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const m = HTML.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(m, 'index.html harus punya tepat satu blok <script type="module">');
const CODE = m[1];

/* Tipe three yang punya .set() */
const HAS_SET = new Set([
  'Vector2', 'Vector3', 'Vector4', 'Color', 'Matrix3', 'Matrix4', 'Quaternion', 'Euler',
]);

/* Ambil daftar properti sebuah deklarasi objek literal `const NAME = { ... };` */
function objectLiteralProps(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*\\{', 'g');
  const hit = re.exec(CODE);
  if (!hit) return null;

  let i = CODE.indexOf('{', hit.index + hit[0].length - 1);
  let depth = 0, end = i;
  for (; end < CODE.length; end++) {
    if (CODE[end] === '{') depth++;
    else if (CODE[end] === '}') { depth--; if (depth === 0) break; }
  }
  const body = CODE.slice(i + 1, end);

  /* pecah pada koma kedalaman-0 supaya nilai bersarang tidak terpotong */
  const parts = [];
  let d = 0, cur = '';
  for (const ch of body) {
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
    if (ch === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const out = {};
  for (const p of parts) {
    const mm = p.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if (mm) out[mm[1]] = p.slice(mm[0].length).trim();
  }
  return out;
}

test('regresi layar hitam: setiap properti yang di-.set() harus bertipe vektor', () => {
  const props = objectLiteralProps('postOpts');
  assert.ok(props, 'deklarasi `const postOpts = {...}` harus ditemukan di index.html');

  /* kumpulkan semua `postOpts.<prop>.set(` yang dipanggil di kode */
  const called = new Set();
  for (const mm of CODE.matchAll(/\bpostOpts\.([A-Za-z_$][\w$]*)\s*\.\s*set\s*\(/g)) {
    called.add(mm[1]);
  }
  assert.ok(called.size > 0,
    'sanity: harus ada pemanggilan postOpts.<prop>.set() yang diuji');

  for (const prop of called) {
    const value = props[prop];
    assert.ok(value !== undefined,
      `postOpts.${prop} dipanggil .set() tapi tidak ada di deklarasi`);

    const ctor = value.match(/^new\s+THREE\.([A-Za-z0-9_$]+)\s*\(/);
    assert.ok(ctor,
      `postOpts.${prop} diinisialisasi sebagai "${value}" — objek polos TIDAK punya .set(); ` +
      `harus new THREE.Vector2/Vector3. Bug ini membuat animate() melempar tiap frame ` +
      `(layar hitam, UI tetap tampil).`);

    assert.ok(HAS_SET.has(ctor[1]),
      `postOpts.${prop} memakai THREE.${ctor[1]} yang tidak punya .set()`);
  }
});

test('regresi layar hitam: postOpts.sunScreen khusus (bug aslinya)', () => {
  const props = objectLiteralProps('postOpts');
  assert.match(props.sunScreen, /^new\s+THREE\.Vector2\s*\(/,
    'sunScreen harus Vector2 — dulu {x,y} polos dan membuat layar hitam');
  assert.match(props.blurDir, /^new\s+THREE\.Vector2\s*\(/,
    'blurDir juga dibaca lewat .set() di animate()');
});

test('postfx tetap menerima objek {x,y} biasa sebagai fallback', () => {
  /* postfx hanya MEMBACA .x/.y, jadi Vector2 aman dan objek polos pun aman
     di sisi penerima. Yang fatal hanya sisi PEMANGGIL (.set). */
  const src = readFileSync(resolve(__dirname, '../game/postfx.mjs'), 'utf8');
  assert.ok(/opts\.sunScreen\s*\|\|\s*\{\s*x:/.test(src),
    'postfx harus punya fallback untuk sunScreen');
  assert.ok(!/sunScreen\s*\.\s*set\s*\(/.test(src),
    'postfx tidak boleh memanggil .set() pada sunScreen (hanya membacanya)');
});

test('jaring pengaman: animate() tidak boleh mati tanpa jejak', () => {
  /* Kalau ada error lain di masa depan, gejalanya sama: layar hitam tanpa
     petunjuk. Pastikan rAF tetap baris pertama (loop tidak boleh berhenti)
     DAN ada penanganan error global yang menampilkan pesan, bukan diam. */
  const fn = CODE.slice(CODE.indexOf('function animate('));
  const body = fn.slice(0, fn.indexOf('\n}'));
  const first = body.split('\n')[1].trim();
  assert.match(first, /^requestAnimationFrame\(animate\)/,
    'requestAnimationFrame harus tetap baris pertama animate() supaya loop tidak berhenti');
});

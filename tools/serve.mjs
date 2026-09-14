#!/usr/bin/env node
/* ============================================================
   Server statis untuk pratinjau game di sandbox.

   Jalankan:  node tools/serve.mjs   [port]
   Bind ke 0.0.0.0 supaya bisa diakses dari luar sandbox.

   Kenapa bukan `npx serve`: repo ini tidak punya package.json, dan
   modul ES hanya jalan kalau content-type-nya benar. Server generik
   sering mengirim .mjs sebagai text/plain, yang membuat browser
   menolak mengeksekusinya — halaman jadi kosong tanpa error jelas.

   Catatan keamanan: server ini bind ke 0.0.0.0, jadi ia terjangkau
   dari luar sandbox. `.git/` berada DI DALAM root repo, jadi penjaga
   "jangan keluar dari root" saja tidak cukup — dotfile harus ditolak
   terpisah, kalau tidak `.git/config` ikut terkirim.
   ============================================================ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',   // penting: modul ES
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/* Direktori yang tidak pernah perlu dilayani saat pratinjau. */
const BLOCKED_SEGMENTS = new Set(['node_modules']);

/**
 * Petakan URL ke path berkas yang aman, atau null bila harus ditolak.
 *
 * Murni (tanpa I/O) supaya bisa dites: inilah bagian yang gampang salah
 * dan berakibat bocornya berkas di luar yang dimaksud.
 */
export function resolveSafe(root, rawPathname) {
  if (typeof rawPathname !== 'string' || rawPathname.length === 0) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null;                       // persen-encoding rusak
  }
  /* byte NUL bisa dipakai menyelundupkan akhir string ke API berkas */
  if (pathname.includes('\0')) return null;

  if (pathname === '/') return join(root, 'index.html');

  const relative = normalize(pathname).replace(/^([/\\])+/, '');
  const filePath = join(root, relative);

  /* 1) tidak boleh keluar dari root */
  if (filePath !== root && !filePath.startsWith(root + sep)) return null;

  /* 2) tidak boleh dotfile/dotdir (.git, .env, .gitignore, ...) maupun
        direktori dependensi — keduanya ada di dalam root */
  for (const seg of relative.split(/[\\/]/)) {
    if (!seg) continue;
    if (seg.startsWith('.')) return null;
    if (BLOCKED_SEGMENTS.has(seg)) return null;
  }

  return filePath;
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://x').pathname;
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('bad request');
    return;
  }

  const filePath = resolveSafe(ROOT, pathname);
  if (!filePath) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }

  try {
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      /* jalur tanpa ekstensi -> index.html (pratinjau SPA) */
      if (extname(filePath)) throw new Error('not found');
      body = await readFile(join(ROOT, 'index.html'));
    }

    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      /* pratinjau dev: jangan sampai browser menyimpan berkas lama */
      'cache-control': 'no-store',
      'content-length': body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

/* hanya mulai mendengarkan bila dijalankan langsung, bukan saat diimpor tes */
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (invokedDirectly) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`serving on 0.0.0.0:${PORT}  (root: ${ROOT})`);
  });
}

export { MIME, server, ROOT };

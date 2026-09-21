#!/usr/bin/env node
// Bikin paket pembaruan game.
//   node scripts/make-update.mjs --baseline   -> tulis www/version.json (versi bawaan APK)
//   node scripts/make-update.mjs --update     -> tulis folder update/ (game.html + version.json) untuk di-host
//   (tanpa argumen = dua-duanya)
// Nomor build = waktu commit terakhir (detik), jadi APK dan server selalu sepakat mana yang lebih baru.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const both = !args.includes('--baseline') && !args.includes('--update');
const doBaseline = both || args.includes('--baseline');
const doUpdate = both || args.includes('--update');

function git(cmd) {
  try { return execSync('git ' + cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
}

const game = readFileSync('www/game.html');
const sha256 = createHash('sha256').update(game).digest('hex');

const build = Number(process.env.BZ_BUILD) || Number(git('log -1 --format=%ct')) || Math.floor(Date.now() / 1000);
const d = new Date(build * 1000);
const pad = (n) => String(n).padStart(2, '0');
const short = (process.env.BZ_SHA || git('rev-parse --short HEAD') || sha256.slice(0, 7)).slice(0, 7);
const name = process.env.BZ_NAME || `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}.${short}`;

const info = { build, name, file: 'game.html', size: game.length, sha256 };

if (doBaseline) {
  writeFileSync('www/version.json', JSON.stringify({ build, name, file: 'game.html' }, null, 2) + '\n');
  console.log('www/version.json ->', build, name);
}
if (doUpdate) {
  mkdirSync('update', { recursive: true });
  copyFileSync('www/game.html', 'update/game.html');
  writeFileSync('update/version.json', JSON.stringify(info, null, 2) + '\n');
  writeFileSync('update/.nojekyll', '');
  writeFileSync('update/index.html', '<!doctype html><meta charset="utf-8"><title>BlockZone update</title>BlockZone update server\n');
  console.log('update/ ->', build, name, game.length + ' bytes', sha256.slice(0, 12) + '…');
}

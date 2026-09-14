/* ============================================================
   Hook resolver Node supaya tes bisa memakai three.js yang SUDAH
   di-vendor di repo — tanpa `npm install` sama sekali.

   Ini cermin persis dari importmap di index.html:
     'three'          -> ../three.module.js
     'three/addons/*' -> ../jsm/*

   Harus di-import SEBELUM modul yang meng-import 'three', dan modul
   target-nya harus diambil lewat dynamic import (await import(...)),
   karena resolusi static import terjadi sebelum body modul mana pun
   dijalankan.
   Butuh Node >= 22.15 (module.registerHooks).
============================================================ */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

registerHooks({
  resolve(spec, ctx, next){
    if(spec === 'three')
      return next(pathToFileURL(path.join(ROOT, 'three.module.js')).href, ctx);
    if(spec.startsWith('three/addons/'))
      return next(pathToFileURL(path.join(ROOT, 'jsm', spec.slice('three/addons/'.length))).href, ctx);
    return next(spec, ctx);
  },
});

// Diisi otomatis oleh GitHub Actions (UPDATE_BASE_URL) saat build APK.
// Kosong = tanpa pembaruan online, game selalu pakai versi bawaan APK.
// `repo` dipakai untuk mirror otomatis: raw.githubusercontent.com + cdn.jsdelivr.net
// (paket update juga ditebar ke branch `update-pkg` oleh workflow Publish Game Update).
window.BZ_UPDATE = { url: '', repo: 'KyokoApp/rpg' };

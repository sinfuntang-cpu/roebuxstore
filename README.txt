WARUNG ROEBUX - siap deploy ke Vercel

Isi: index.html, roblox-api.js, api/roblox.js (proxy Roblox sendiri), package.json

Cara 1 (CLI):
  npm i -g vercel
  cd folder-ini
  vercel --prod

Cara 2 (GitHub):
  Upload semua file ke repo, lalu Import Project di vercel.com/new
  (Framework Preset: Other, tanpa build command).

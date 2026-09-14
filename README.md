# KONSAOL — Konsolidasi Accurate Online

Web application untuk konsolidasi laporan keuangan multi-company dari Accurate Online melalui OAuth.

## Fitur MVP
- OAuth Accurate Online (tanpa input access token manual)
- Daftar database Accurate dan pemilihan company
- Sinkronisasi Journal Voucher per periode
- Mapping akun reporting dan intercompany
- Laporan konsolidasi berdampingan antar perusahaan
- PostgreSQL + Prisma
- Next.js 15 / React 19
- Railway-ready

## Environment Variables
Salin `.env.example` dan isi nilai berikut di Railway:

```env
DATABASE_URL=postgresql://...
APP_ENCRYPTION_KEY=...
ACCURATE_CLIENT_ID=...
ACCURATE_CLIENT_SECRET=...
ACCURATE_REDIRECT_URI=https://YOUR-DOMAIN.up.railway.app/api/accurate/oauth/callback
ACCURATE_OAUTH_SCOPES=journal_voucher_view
```

Callback URL harus sama persis dengan URL yang didaftarkan pada aplikasi Accurate Developer.

## Railway
Build command:
```bash
npm run build
```

Start command:
```bash
npm run start
```

Saat start, Prisma akan menjalankan `db push` lalu Next.js berjalan pada `$PORT` Railway.

# KONSAOL — Konsolidasi Accurate Online

Web app multi-tenant untuk konsolidasi database Accurate Online.

## Fitur versi ini
- Login / register KONSAOL
- Trial 3 hari, maksimal 3 database
- Paket tahunan Rp2.500.000, maksimal 5 database
- Add-on Rp1.000.000 / tahun / slot, maksimal 5 slot tambahan
- Admin panel: aktivasi subscription, addon slot, reset password
- OAuth Accurate Online per user
- Pilih database Accurate
- Sync Chart of Accounts (`glaccount/list.do`) per database
- Tampilkan seluruh COA masing-masing company
- Sync Journal Voucher
- Mapping khusus pasangan akun eliminasi antar database
- Laba Rugi & Neraca multi-company + ringkasan eliminasi

## Railway variables
```env
DATABASE_URL=...
APP_URL=https://domain-anda.up.railway.app
APP_ENCRYPTION_KEY=long-random-secret
AUTH_SECRET=another-long-random-secret
ADMIN_EMAIL=admin@domainanda.com
ADMIN_PASSWORD=password-admin-awal
ACCURATE_CLIENT_ID=...
ACCURATE_CLIENT_SECRET=...
ACCURATE_REDIRECT_URI=https://domain-anda.up.railway.app/api/accurate/oauth/callback
ACCURATE_OAUTH_SCOPES="journal_voucher_view glaccount_view"
```

> Setelah menambah scope COA, pastikan scope tersebut juga diizinkan pada aplikasi di Accurate Developer. User yang sebelumnya sudah OAuth perlu klik **Hubungkan Ulang** agar consent/token memperoleh scope baru.

## Deploy
Build: `npm run build`

Start: `npm run start`

Start command otomatis menjalankan `prisma db push --skip-generate` sebelum Next.js start.

## Admin
Admin awal dibuat otomatis ketika halaman login pertama kali dibuka, menggunakan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari environment variables.

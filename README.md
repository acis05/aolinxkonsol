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

Start command otomatis menjalankan `prisma db push --skip-generate --accept-data-loss` sebelum Next.js start. Pada upgrade v1 → v2, Prisma memberi warning karena penambahan unique constraint pada kolom baru nullable (`userId` dan `tenantDbKey`). Data lama pada kolom baru tersebut bernilai NULL, sehingga constraint dapat ditambahkan tanpa menghapus data transaksi lama.

## Admin
Admin awal dibuat otomatis ketika halaman login pertama kali dibuka, menggunakan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari environment variables.

## OAuth + COA fix (2026-09-14)
- Callback OAuth sekarang langsung memvalidasi `db-list.do` setelah token tersimpan.
- Error OAuth/API ditampilkan di halaman Perusahaan, tidak lagi tersembunyi.
- `glaccount/list.do` mengikuti dokumentasi Accurate: scope `glaccount_view`, `X-Session-ID`, pagination `sp.page`/`sp.pageSize`.
- Semua halaman COA ditarik memakai `sp.pageCount`, sehingga tidak berhenti prematur bila server membatasi page size.
- Redirect host HTTP 308 Accurate ditangani manual dan Authorization + X-Session-ID dikirim ulang ke host baru.

Environment Railway yang disarankan:
```env
ACCURATE_OAUTH_SCOPES="journal_voucher_view glaccount_view"
```
Setelah menambah/mengubah scope, klik **Hubungkan Ulang Accurate** agar token baru memperoleh scope tersebut.

## OAuth callback fix (2026-09)
Callback OAuth tidak lagi bergantung pada cookie sesi browser. `state` OAuth sekarang berisi user id + expiry yang ditandatangani HMAC memakai `AUTH_SECRET`/`APP_ENCRYPTION_KEY`. Ini mencegah loop callback -> /login pada reverse proxy/Railway ketika cookie sesi tidak ikut pada round-trip OAuth. Callback juga membuat ulang cookie sesi KONSAOL setelah token berhasil ditukar dan memvalidasi `db-list.do` sebelum menampilkan status connected.

Pastikan `APP_URL` dan origin dari `ACCURATE_REDIRECT_URI` sama. Contoh:
APP_URL=https://konsaol-production.up.railway.app
ACCURATE_REDIRECT_URI=https://konsaol-production.up.railway.app/api/accurate/oauth/callback

## Update Journal Voucher sync
- Tambah menu **Jurnal Umum** untuk melihat seluruh JV yang sudah disinkronkan beserta baris debit/kredit.
- Tambah tombol **Sync Semua JV** per database.
- Pagination JV mengikuti `sp.pageCount`, bukan berhenti berdasarkan jumlah row halaman pertama.
- `journal-voucher/detail.do` sekarang wajib berhasil agar baris debit/kredit disimpan; error detail ditampilkan kembali ke halaman Perusahaan.
- Filter tanggal HTML (`yyyy-MM-dd`) otomatis dikonversi ke format API Accurate (`dd/MM/yyyy`).


## JV sync optimization (v2.1)
- `list.do` now requests `detailJournalVoucher` inline when Accurate supports it.
- Falls back to `detail.do` only for rows without inline details, with concurrency limited to 8.
- Response parser prefers object `r` over message-array `d` to avoid zero-line journals.
- Journal page is paginated and reports legacy header-only rows.

## Laporan keuangan v2

Laporan Konsolidasi sekarang memakai format akuntansi umum berjenjang:
- Laba Rugi: Pendapatan Usaha, Beban Pokok Pendapatan, Laba Kotor, Beban Usaha, Laba Usaha, Pendapatan/Beban Lain-lain, Laba Bersih.
- Neraca: Aset Lancar, Aset Tidak Lancar, Liabilitas Jangka Pendek, Liabilitas Jangka Panjang, Ekuitas, Laba/Rugi Tahun Berjalan, dan balance check.
- Neraca dihitung kumulatif sampai tanggal laporan, bukan hanya pergerakan dalam rentang tanggal.
- Kolom laporan: masing-masing perusahaan, Eliminasi, Konsolidasi.
- Export Excel dan PDF tersedia dari halaman Laporan dan memakai struktur yang sama dengan layar.

PENTING: setelah upgrade ini, jalankan **Sync COA** untuk setiap database sekali lagi agar `accountType` asli Accurate (COGS, CASH_BANK, ACCOUNT_RECEIVABLE, dll.) tersimpan di `reportGroup` dan klasifikasi laporan menjadi presisi.

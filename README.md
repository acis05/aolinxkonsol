# Accurate Consolidation

Web app MVP untuk konsolidasi multi-company Accurate Online dengan OAuth 2.0 Authorization Code.

## Fitur
- OAuth Accurate Online (tanpa input access token manual)
- Access token + refresh token tersimpan terenkripsi di PostgreSQL
- Refresh access token otomatis sebelum expire
- Daftar database via `/api/db-list.do`
- Open database via `/api/open-db.do` untuk mendapatkan `host` + `X-Session-ID`
- Multi-company Accurate database
- Sync Journal Voucher via `/accurate/api/journal-voucher/list.do`
- Optional detail enrichment via `/accurate/api/journal-voucher/detail.do`
- Reporting account mapping
- Intercompany mapping metadata
- Consolidated report: kolom per company + total
- PostgreSQL + Prisma
- Siap deploy ke Railway

## 1. Buat aplikasi OAuth di Accurate
Di Accurate Developer Area, buat aplikasi platform **Website**, lalu isi URL OAuth Callback.

Untuk local:
`http://localhost:3000/api/accurate/oauth/callback`

Untuk Railway:
`https://DOMAIN-ANDA.up.railway.app/api/accurate/oauth/callback`

Simpan **Client ID** dan **Client Secret** ke environment variables; jangan commit nilainya ke GitHub.

Scope default project: `journal_voucher_view`.

## 2. Deploy ke Railway
1. Upload repo ini ke GitHub.
2. Railway → **New Project → Deploy from GitHub Repo**.
3. Tambahkan service PostgreSQL.
4. Pastikan `DATABASE_URL` tersedia pada app service.
5. Tambahkan variables:
   - `APP_ENCRYPTION_KEY`
   - `ACCURATE_CLIENT_ID`
   - `ACCURATE_CLIENT_SECRET`
   - `ACCURATE_REDIRECT_URI=https://DOMAIN-ANDA.up.railway.app/api/accurate/oauth/callback`
   - `ACCURATE_OAUTH_SCOPES=journal_voucher_view`
6. Build command: `npm run build`
7. Start command: `npm run start`
8. Setelah deploy / schema berubah, jalankan `npx prisma db push`.
9. Pastikan callback URL yang sama persis juga terdaftar di Accurate Developer Area.

## 3. Cara pakai
1. Buka `/companies`.
2. Klik **Connect Accurate**.
3. Login ke Accurate dan beri akses.
4. Setelah kembali ke aplikasi, daftar database Accurate tampil otomatis.
5. Klik **Add** untuk company yang ingin dikonsolidasi.
6. Isi periode dan klik **Sync**.
7. Atur mapping akun di `/mappings`.
8. Lihat laporan di `/reports`.

## Development
```bash
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

## Security
- Client Secret hanya digunakan server-side.
- Token OAuth tidak pernah dikirim ke browser.
- Access/refresh token dienkripsi AES-256-GCM sebelum disimpan ke PostgreSQL.
- `APP_ENCRYPTION_KEY` wajib disimpan sebagai Railway Secret/Variable dan tidak boleh di-commit.
- OAuth `state` divalidasi melalui cookie HttpOnly untuk mengurangi risiko CSRF.

## Catatan API jurnal
Dokumentasi yang tersedia menjelaskan request `list.do`, namun belum memberikan schema response lengkap `detail.do`. Parser detail dibuat defensif. Setelah response `detail.do` tersedia, fungsi `detailLines()` di `app/api/companies/[id]/sync/route.ts` dapat dibuat lebih ketat.

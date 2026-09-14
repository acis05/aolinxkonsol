# Accurate Consolidation

Web app MVP untuk konsolidasi multi-company Accurate Online.

## Fitur
- Multi-company Accurate database
- Sync Journal Voucher via `/journal-voucher/list.do`
- Optional detail enrichment via `/journal-voucher/detail.do`
- Reporting account mapping
- Intercompany mapping metadata
- Consolidated report: kolom per company + total
- PostgreSQL + Prisma
- Siap deploy ke Railway

## Deploy ke Railway
1. Upload repo ini ke GitHub.
2. Di Railway, **New Project → Deploy from GitHub Repo**.
3. Tambahkan service **PostgreSQL**.
4. Railway biasanya menyediakan `DATABASE_URL`; pastikan env tersebut tersedia pada app service.
5. Tambahkan env:
   - `ACCURATE_ACCESS_TOKEN` (jika flow OAuth Anda menggunakan Bearer token)
   - `ACCURATE_JOURNAL_LIST_PATH=/accurate/api/journal-voucher/list.do`
   - `ACCURATE_JOURNAL_DETAIL_PATH=/accurate/api/journal-voucher/detail.do`
6. Build command: `npm run build`
7. Start command: `npm run start`
8. Setelah deploy pertama, jalankan sekali: `npx prisma db push` via Railway shell / command.

## Development
```bash
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

## Accurate configuration
Tambahkan Company dari halaman `/companies` dan isi:
- Company name
- Accurate API host hasil `open-db.do`
- `X-Session-ID`

Dokumen `list.do` mendukung `filter.transDate` dan pagination `sp.page` / `sp.pageSize`; implementasi sync menggunakan parameter tersebut.

## Catatan penting
Dokumen yang tersedia untuk project ini menjelaskan request `list.do`, namun tidak memberikan schema response lengkap `detail.do`. Karena itu parser detail dibuat defensif terhadap beberapa nama field umum. Setelah contoh response `detail.do` tersedia, cukup sesuaikan fungsi `detailLines()` di:
`app/api/companies/[id]/sync/route.ts`.

Untuk production, jangan menyimpan session/token permanen tanpa encryption. MVP ini menyimpan `sessionId` pada DB agar setup cepat; untuk production sebaiknya gunakan KMS/encrypted secret storage.

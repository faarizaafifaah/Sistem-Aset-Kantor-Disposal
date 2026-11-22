# PT. Zeea — Sistem Inventaris Aset

Aplikasi web berbasis *Single-Page Application* (SPA) untuk mengelola inventaris aset perusahaan milik **PT. Zeea**. Sistem ini dirancang untuk memantau kondisi aset, menghitung akhir masa manfaat secara otomatis, mencatat pelepasan (*disposal*), serta mendeteksi aktivitas pengunjung yang membuka aplikasi secara *real-time*.

---

## ✨ Fitur Utama

### 1. Dashboard & Ringkasan Statistik
* **Kartu Statistik Real-Time:** Menampilkan total seluruh aset, jumlah aset kondisi **Baik**, aset **Rusak**, aset berstatus **Disposal**, total kategori, serta akumulasi **Total Nilai Aset** dalam format Rupiah (`IDR`).
* **Pengingat Masa Manfaat Otomatis:** Menghitung perkiraan tanggal berakhirnya masa manfaat setiap aset aktif berdasarkan `tanggal_perolehan` dan `masa_manfaat_tahun`:
  * **Masih dalam masa manfaat** (sisa waktu $> 180$ hari)
  * **Segera berakhir** (sisa waktu $\le 180$ hari)
  * **Masa manfaat terlewati** (melewati batas tanggal akhir masa manfaat)

### 2. Manajemen Data Aset (CRUD)
* Tambah, ubah, dan hapus data aset beserta detail kode aset, nama, kategori, tanggal perolehan, harga perolehan, masa manfaat, kondisi, lokasi, dan keterangan.
* Dilengkapi fitur pencarian cepat berdasarkan kode/nama aset serta filter berdasarkan kondisi (`Baik`, `Rusak`, `Disposal`).

### 3. Disposal Aset
* Mencatat riwayat pelepasan aset (tanggal disposal, alasan pelepasan, dan nilai jual/disposal).
* Mengubah status kondisi aset secara otomatis menjadi **Disposal** setelah pencatatan disimpan.

### 4. Pemantauan Aset Rusak & Riwayat Kondisi
* Menampilkan daftar khusus aset yang berstatus **Rusak** untuk memudahkan tindak lanjut perbaikan.
* Memperbarui status kondisi aset dan menyimpan catatan pemeriksaan ke dalam tabel riwayat kondisi (`riwayat_kondisi`).

### 5. Manajemen Kategori Aset
* Mengelompokkan aset berdasarkan kategori (`Elektronik`, `Furniture`, `Kendaraan`, `Peralatan Kantor`, maupun kategori kustom baru) lengkap dengan penghitungan jumlah aset terdaftar pada tiap kategori.

### 6. Deteksi & Log Pengunjung Real-Time
* **Indikator Online Langsung:** Menampilkan jumlah pengguna yang sedang membuka aplikasi secara bersamaan menggunakan **Supabase Realtime Presence** beserta notifikasi saat perangkat baru terdeteksi masuk.
* **Pencatatan Riwayat Akses Otomatis:** Menyimpan waktu akses, ID unik perangkat (`VIS-XXXX`), nama/label perangkat, jenis perangkat (`Desktop/Laptop`, `HP/Mobile`, `Tablet`), sistem operasi, browser, dan resolusi layar.
* **Penamaan Perangkat:** Pengguna dapat menandai nama perangkat masing-masing agar mudah dikenali pada log aktivitas.

---

## 🛠️ Teknologi yang Digunakan

* **Frontend:** HTML5, CSS3 (Responsive Grid & Flexbox), Vanilla JavaScript (ES6+)
* **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL & Realtime Presence)
* **Tipografi:** Google Fonts (`Manrope` & `DM Sans`)

---

## 📁 Struktur Proyek

```text
final/
├── backend/
│   ├── app.js           # Dokumentasi arsitektur koneksi backend
│   └── database.sql     # Skema tabel PostgreSQL, indeks, dan kebijakan RLS
├── frontend/
│   ├── index.html       # Struktur antarmuka utama dan modal form
│   ├── style.css        # Styling responsif dan komponen UI
│   └── script.js        # Logika aplikasi, integrasi Supabase, & deteksi pengunjung
└── README.md            # Dokumentasi proyek
```

---

## 🚀 Panduan Instalasi & Konfigurasi

Aplikasi ini tidak memerlukan server *runtime* tambahan (seperti Node.js atau PHP) karena terhubung langsung ke Supabase dari sisi *frontend*.

### Langkah 1: Siapkan Database di Supabase
1. Buat proyek baru di [Supabase Dashboard](https://supabase.com/dashboard).
2. Buka menu **SQL Editor** di panel sebelah kiri.
3. Salin seluruh isi file `backend/database.sql`, tempelkan ke editor, lalu klik **Run** hingga muncul status `Success`.
4. Pastikan kelima tabel berikut telah terbentuk di menu **Table Editor**:
   * `kategori`
   * `aset`
   * `disposal`
   * `riwayat_kondisi`
   * `log_pengunjung`

### Langkah 2: Konfigurasi Kredensial Supabase
1. Buka **Project Settings → API** pada dashboard Supabase Anda.
2. Salin **Project URL** dan **anon / publishable key**.
3. Buka file `frontend/script.js` dan sesuaikan dua baris konfigurasi di bagian paling atas:
   ```javascript
   const SUPABASE_URL = "https://url-proyek-anda.supabase.co";
   const SUPABASE_ANON_KEY = "kunci-anon-publishable-anda";
   ```

### Langkah 3: Jalankan Aplikasi
* Buka file `frontend/index.html` secara langsung menggunakan browser modern (Chrome, Edge, Firefox, atau Safari), **atau**
* Jalankan melalui ekstensi **Live Server** di VS Code agar fitur *Realtime Presence* berjalan optimal pada protokol `http://localhost`.

---

## 🗄️ Ringkasan Skema Database

| Nama Tabel | Deskripsi |
| :--- | :--- |
| `kategori` | Menyimpan daftar kategori inventaris aset. |
| `aset` | Menyimpan data utama aset, nilai perolehan, masa manfaat, lokasi, dan kondisi terkini. |
| `disposal` | Menyimpan riwayat aset yang dilepas/dihapusbukukan beserta alasan dan nilai jual. |
| `riwayat_kondisi` | Mencatat log perubahan status kondisi aset saat dilakukan pemeriksaan atau perbaikan. |
| `log_pengunjung` | Mencatat riwayat perangkat dan waktu akses setiap pengunjung yang membuka aplikasi. |

---

## 🔒 Catatan Keamanan

* **Jangan pernah** menggunakan `service_role` key di dalam file `frontend/script.js`. Gunakan hanya kunci `anon` / `publishable`.
* Kebijakan *Row Level Security* (RLS) bawaan pada `database.sql` dikonfigurasi terbuka (`USING (true)`) untuk mempermudah pengujian prototipe tanpa autentikasi. Sebelum digunakan untuk lingkungan produksi perusahaan, tambahkan **Supabase Auth** (halaman login) dan batasi kebijakan RLS hanya untuk pengguna terautentikasi.
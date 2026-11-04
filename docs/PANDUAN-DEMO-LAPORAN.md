# Panduan Demo dan Laporan Proyek

Panduan ini mencakup demo server/client lokal, Docker Compose, dua komputer, serta pengujian beban. Jalankan skenario sesuai urutan agar pengujian beban menjadi bagian terakhir: benchmark membuat satu kursi terisi.

## 1. Persiapan demo dari awal

Pastikan Node.js 18 atau lebih baru sudah terpasang. Dari PowerShell, buka folder proyek:

```powershell
cd D:\PemwebUAS\KPT-TugasProyekMini-ReservasiTiketBioskop
npm install
```

Server menyimpan reservasi ke `data/reservations.json`. Untuk mengosongkan reservasi demo lama, hentikan server terlebih dahulu, lalu buat backup dan reset file:

```powershell
Copy-Item .\data\reservations.json .\data\reservations.backup.json
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'data\reservations.json'), '{"reservations":[],"requests":{}}', [System.Text.UTF8Encoding]::new($false))
```

File backup berada di folder `data` (yang diabaikan Git). Jika perlu mengembalikan data lama, salin kembali `reservations.backup.json` menjadi `reservations.json`. Jangan reset data saat server masih berjalan.

## 2. Demo server dan client pada satu komputer

Buka dua terminal PowerShell di folder proyek.

Terminal 1 — mulai server:

```powershell
npm start
```

Server mendengarkan pada `0.0.0.0:50051`. Biarkan terminal ini tetap berjalan.

Terminal 2 — mulai client:

```powershell
npm run client
```

Pilih film dan jadwal dari daftar, amati peta kursi, lalu masukkan kode kursi yang masih tersedia (misalnya `A1`) dan nama pelanggan. Tunjukkan status `CONFIRMED` dan ID reservasi. Jalankan client sekali lagi untuk menunjukkan kursi yang telah dipesan ditandai terisi.

Yang dicatat untuk laporan: pilihan film/jadwal, kursi, status hasil, ID reservasi, dan bukti peta sebelum/sesudah pemesanan.

## 3. Demo lintas container dengan Docker Compose

Prasyarat: Docker Desktop aktif. Dari folder proyek:

```powershell
docker compose build
docker compose up -d server
docker compose run --rm client
```

Client berjalan pada container berbeda dan menghubungi nama layanan `server:50051` melalui jaringan Compose. Pilih kursi yang masih tersedia dan selesaikan reservasi.

Untuk memulai volume demo Compose dari nol pada kesempatan berikutnya, hentikan container dan hapus volume Compose:

```powershell
docker compose down -v
```

Perintah tersebut menghapus data `cinema-data` milik Docker Compose secara permanen. Jalankan hanya jika data volume demo memang boleh dibuang. Untuk berhenti tanpa menghapus data, gunakan `docker compose down`.

Yang dicatat untuk laporan: nama container server/client, alamat layanan internal `server:50051`, hasil reservasi, dan bukti `docker compose ps` atau log server.

## 4. Demo dari dua komputer pada jaringan lokal

Kedua komputer harus berada pada jaringan yang sama dan menggunakan salinan proyek dengan dependensi terpasang. Gunakan satu server saja.

**Komputer A (server):** cari alamat IPv4 LAN dengan `ipconfig`, lalu jalankan:

```powershell
npm start
```

Izinkan koneksi masuk TCP port `50051` pada Windows Firewall untuk jaringan lokal/private. Jika koneksi gagal, periksa IP yang benar, profil jaringan, firewall, dan pastikan server masih berjalan.

**Komputer B (client):** arahkan client ke alamat IPv4 Komputer A, misalnya `192.168.1.20`:

```powershell
$env:GRPC_ADDRESS="192.168.1.20:50051"
npm run client
```

Ganti IP contoh dengan IP LAN Komputer A. Pastikan kedua komputer mengacu ke server yang sama. Jangan menjalankan server kedua untuk data bersama: penyimpanan JSON lokal tidak menyinkronkan beberapa server.

Untuk benchmark dari Komputer B terhadap server Komputer A, gunakan alamat yang sama:

```powershell
$env:GRPC_ADDRESS="192.168.1.20:50051"
npm run benchmark
```

Catat kedua perangkat, sistem operasi, koneksi jaringan, alamat server, dan hasil. Angka latensi/throughput lintas komputer tidak sebanding langsung dengan hasil loopback lokal karena mencakup jaringan.

## 5. Pengujian beban

Jalankan satu server terlebih dahulu. Gunakan data demo terpisah untuk mengisolasi perubahan benchmark dari demo utama. Skrip sudah memakai `results/benchmark-reservations.json` bila server diarahkan ke file tersebut. Pada PowerShell:

```powershell
$env:DATA_FILE="results/benchmark-reservations.json"
npm start
```

Di terminal kedua:

```powershell
$env:BENCH_CLIENTS="1,5,20"
$env:BENCH_REQUESTS="100"
$env:BENCH_SHOWTIME="show-001"
npm run benchmark
```

Jika benchmark menarget server komputer lain, isi `GRPC_ADDRESS` di terminal benchmark (contoh `192.168.1.20:50051`). Pastikan server itu menggunakan dataset benchmark terpisah juga. Skrip menjalankan 100 RPC `GetSeatMap` pada tiap tingkat konkurensi, lalu 20 client berebut satu kursi kosong yang sama. Hasil yang diharapkan: tepat 1 `CONFIRMED`, 19 `SEAT_UNAVAILABLE`, dan 0 error RPC. Kursi pemenang terisi di dataset benchmark.

Setiap eksekusi menghasilkan JSON terperinci dan CSV di `results/` dengan nama timestamp. Salin angka dari CSV/JSON ke tabel laporan. Setelah selesai, hentikan server dan hapus environment variable pada terminal:

```powershell
Remove-Item Env:DATA_FILE -ErrorAction SilentlyContinue
Remove-Item Env:GRPC_ADDRESS -ErrorAction SilentlyContinue
Remove-Item Env:BENCH_CLIENTS -ErrorAction SilentlyContinue
Remove-Item Env:BENCH_REQUESTS -ErrorAction SilentlyContinue
Remove-Item Env:BENCH_SHOWTIME -ErrorAction SilentlyContinue
```

## 6. Format hasil untuk laporan

### Lingkungan pengujian

- Tanggal dan waktu:
- Node.js / Docker Desktop:
- Sistem operasi:
- Perangkat server dan client:
- Jenis koneksi / jaringan:
- Skenario (lokal, Docker Compose, dua komputer, benchmark):
- Alamat target:

### Hasil benchmark

| Client bersamaan | Request | Berhasil | Error | Rata-rata (ms) | p95 (ms) | Durasi (s) | Throughput (req/s) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 100 |  |  |  |  |  |  |
| 5 | 100 |  |  |  |  |  |  |
| 20 | 100 |  |  |  |  |  |  |

| Uji kontensi | Client | Confirmed | Seat unavailable | Error RPC | Rata-rata (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Satu kursi yang sama | 20 |  |  |  |  |

### Interpretasi

> Isi berdasarkan berkas benchmark yang dihasilkan. Bandingkan latensi dan throughput antar tingkat konkurensi, laporkan apakah terjadi error, dan pastikan hasil kontensi menunjukkan hanya satu reservasi berhasil. Nyatakan bahwa hasil berlaku pada perangkat, konfigurasi, dan jaringan yang dicatat; satu kali pengujian bukan ukuran kapasitas maksimum.

### Bukti yang disarankan

- Server berjalan dan alamat bind yang digunakan.
- Client menampilkan film, jadwal, peta kursi, serta hasil reservasi.
- Container Compose berjalan dan client berhasil mengakses server.
- Client komputer kedua berhasil terhubung ke server LAN.
- Tabel metrik dan ringkasan kontensi dari berkas JSON/CSV benchmark.

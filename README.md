# Reservasi Tiket Bioskop (gRPC)

Fondasi server untuk proyek mini Sistem Terdistribusi. Kontrak layanan ada di `proto/cinema.proto`; server ada di `src/server.js`.

## RPC yang tersedia

- `ListMovies`: daftar film demo.
- `ListShowtimes`: daftar jadwal, dapat difilter menurut film.
- `GetSeatMap`: status kursi untuk satu jadwal.
- `ReserveSeat`: reservasi satu kursi.
- `WatchSeatMap`: server stream yang mengirim peta kursi saat client berlangganan dan setelah reservasi berhasil.

## Menjalankan server

Memerlukan Node.js 18 atau lebih baru.

```sh
npm install
npm start
```

Server mendengarkan di `0.0.0.0:50051`. Atur `GRPC_PORT` atau `DATA_FILE` melalui environment bila diperlukan. Data reservasi disimpan pada `data/reservations.json`, sehingga tetap tersedia setelah proses server dimulai ulang.

## Menjalankan dengan Docker Compose

Pastikan Docker Desktop sudah dibuka dan status engine-nya berjalan. Dari folder proyek yang berisi `docker-compose.yml`, jalankan:

```sh
docker compose build
docker compose up -d server
docker compose run --rm client
```

Server tersedia pada port `50051` di komputer host. Client berjalan pada container terpisah dan terhubung ke `server:50051`. Data reservasi disimpan di named volume `cinema-data`. Hentikan server dengan `docker compose down`; volume data tetap tersimpan.

Jadwal dan film saat ini adalah data demo dalam memori. Dua jadwal contoh ialah `show-001` dan `show-002`; kursi tersedia A1–E8.

## Menjalankan client

Di terminal lain pada komputer yang sama, jalankan `npm run client`. Client meminta film, jadwal, lalu menampilkan peta kursi dan mengirim reservasi. Alamat default adalah `localhost:50051`. Untuk server di komputer lain, atur alamat server:

```powershell
$env:GRPC_ADDRESS="192.168.1.20:50051"
npm run client
```

Client menetapkan deadline 3 detik (`RPC_TIMEOUT_MS`) dan maksimal dua retry (`RPC_MAX_RETRIES`) untuk timeout atau server tidak tersedia. Request reservasi menggunakan satu `request_id` tetap selama retry; operasi pemesanan baru memperoleh ID baru.

## Demo lintas container dengan Docker Compose

Prasyarat: Docker Desktop dengan Compose. Dari direktori proyek jalankan:

```sh
docker compose build
docker compose up -d server
docker compose run --rm client
```

Client berjalan di container terpisah dan mengakses `server:50051`. Data disimpan pada volume `cinema-data`; port server 50051 juga dipublikasikan ke host. `docker compose down` mempertahankan volume, sedangkan `docker compose down -v` menghapus data demo.

## Demo dari dua komputer

Komputer A: jalankan `npm install` dan `npm start`. Izinkan koneksi TCP port 50051 melalui firewall pada jaringan lokal. Komputer B: checkout proyek, jalankan `npm install`, kemudian arahkan client ke IP LAN komputer A:

```sh
GRPC_ADDRESS=192.168.1.20:50051 npm run client
```

Di PowerShell, set `$env:GRPC_ADDRESS="192.168.1.20:50051"` lalu jalankan `npm run client`. Ganti IP contoh dengan alamat komputer A. Jalankan hanya satu server karena file data lokal tidak menyinkronkan replika.

## Konsistensi pemesanan

Semua perubahan reservasi melewati antrean lock di dalam satu proses server. Server memeriksa kursi dan ID permintaan di bagian kritis yang sama, menulis state baru ke file sementara lalu mengganti file data secara atomik, dan baru setelah itu menerbitkan perubahan ke client stream. Dengan demikian dua permintaan serentak untuk kursi yang sama tidak bisa sama-sama berhasil pada satu instance server.

`request_id` harus unik untuk setiap operasi logis dan dipakai ulang tanpa perubahan saat client melakukan retry. Server menyimpan fingerprint payload beserta hasilnya: pengulangan request yang sama mengembalikan hasil awal, sedangkan penggunaan ID yang sama untuk payload berbeda ditolak. Hasil kursi yang sudah terisi juga disimpan agar retry tetap memperoleh jawaban konsisten.

Lock dan penyimpanan file ini ditujukan untuk demo satu instance. Menjalankan beberapa replika server memerlukan database bersama dengan transaksi/constraint unik atau mekanisme lock terdistribusi; file lokal tidak mengoordinasikan proses atau komputer berbeda.

## Pengujian beban

Pastikan server hidup di terminal pertama, lalu jalankan dari terminal kedua:

```sh
npm run benchmark
```

Skrip mengukur 100 pemanggilan `GetSeatMap` untuk setiap tingkat konkurensi 1, 5, dan 20 client. Ini mengukur latensi rata-rata dan throughput RPC tanpa menghabiskan kursi. Setelah itu, 20 client mengirim reservasi secara bersamaan untuk kursi kosong yang sama; hasil yang diharapkan tepat satu `CONFIRMED` dan 19 `SEAT_UNAVAILABLE`. Kursi pada pengujian perebutan akan menjadi terisi secara permanen di file data server.

Hasil otomatis tersimpan di `results/` sebagai JSON (termasuk rincian kontensi) dan CSV (tabel beban). Variabel yang dapat diatur: `GRPC_ADDRESS`, `BENCH_CLIENTS` (contoh `1,5,20`), `BENCH_REQUESTS` (default `100` untuk setiap skenario), `BENCH_SHOWTIME` (default `show-001`), dan `BENCH_OUTPUT` (default `results`). Di PowerShell:

```powershell
$env:BENCH_REQUESTS="100"
$env:BENCH_SHOWTIME="show-001"
npm run benchmark
```

Lihat [prosedur dan format laporan](docs/PENGUJIAN.md) untuk langkah demo, tabel hasil, dan catatan interpretasi metrik.

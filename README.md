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

Jadwal dan film saat ini adalah data demo dalam memori. Dua jadwal contoh ialah `show-001` dan `show-002`; kursi tersedia A1–E8.

## Konsistensi pemesanan

Semua perubahan reservasi melewati antrean lock di dalam satu proses server. Server memeriksa kursi dan ID permintaan di bagian kritis yang sama, menulis state baru ke file sementara lalu mengganti file data secara atomik, dan baru setelah itu menerbitkan perubahan ke client stream. Dengan demikian dua permintaan serentak untuk kursi yang sama tidak bisa sama-sama berhasil pada satu instance server.

`request_id` harus unik untuk setiap operasi logis dan dipakai ulang tanpa perubahan saat client melakukan retry. Server menyimpan fingerprint payload beserta hasilnya: pengulangan request yang sama mengembalikan hasil awal, sedangkan penggunaan ID yang sama untuk payload berbeda ditolak. Hasil kursi yang sudah terisi juga disimpan agar retry tetap memperoleh jawaban konsisten.

Lock dan penyimpanan file ini ditujukan untuk demo satu instance. Menjalankan beberapa replika server memerlukan database bersama dengan transaksi/constraint unik atau mekanisme lock terdistribusi; file lokal tidak mengoordinasikan proses atau komputer berbeda.

## Pengembangan berikutnya

Client perlu menerapkan deadline/timeout dan retry dengan `request_id` yang sama. Anggota pengujian dapat membandingkan hasil 1, 5, dan 20 client bersamaan, termasuk membuktikan hanya satu reservasi berhasil ketika semua client merebut kursi yang sama.

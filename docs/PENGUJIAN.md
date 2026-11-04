# Prosedur Pengujian dan Laporan Demo

## Tujuan

1. Memastikan perebutan satu kursi secara bersamaan tidak menghasilkan pemesanan ganda.
2. Membandingkan latensi rata-rata dan throughput layanan pada 1, 5, dan 20 client.

## Persiapan dan menjalankan

Gunakan Node.js 18 atau lebih baru, pasang dependensi dengan `npm install`, lalu jalankan hanya satu instance server (penyimpanan JSON lokal hanya mengoordinasikan satu proses).

Terminal 1: `npm start`

Terminal 2: `npm run benchmark`

Jika server berada di komputer/container lain, set `GRPC_ADDRESS` (contoh `192.168.1.20:50051`). Di PowerShell: `$env:GRPC_ADDRESS="192.168.1.20:50051"`.

## Skenario dan kriteria

| Skenario | Cara kerja | Kriteria |
| --- | --- | --- |
| Beban 1 client | 100 `GetSeatMap` RPC berurutan | Semua berhasil; catat latensi rata-rata, p95, throughput |
| Beban 5 client | 100 RPC dibagi ke 5 client paralel | Semua berhasil; catat metrik yang sama |
| Beban 20 client | 100 RPC dibagi ke 20 client paralel | Semua berhasil; catat metrik yang sama |
| Kontensi kursi | 20 client reservasi serentak untuk satu kursi kosong | Tepat 1 `CONFIRMED`, 19 `SEAT_UNAVAILABLE`, 0 error RPC |

`GetSeatMap` dipakai untuk mengukur throughput agar skenario beban tidak menghabiskan kursi. Uji kontensi terpisah memutasi data: kursi pemenang tetap terisi. Bila kursi kosong tidak tersedia, pilih jadwal lain dengan `BENCH_SHOWTIME`.

Hasil otomatis tersimpan di `results/` sebagai JSON (termasuk rincian kontensi) dan CSV (tabel beban). Variabel: `GRPC_ADDRESS`, `BENCH_CLIENTS` (default `1,5,20`), `BENCH_REQUESTS` (default `100` per skenario), `BENCH_SHOWTIME` (default `show-001`), `BENCH_OUTPUT` (default `results`).

## Definisi metrik

- **Latensi rata-rata (ms):** rata-rata waktu sisi client dari pengiriman hingga callback respons; termasuk jaringan dan antrean server.
- **Throughput (req/s):** jumlah RPC berhasil dibagi waktu dinding keseluruhan skenario.
- **p95 (ms):** latensi yang tidak dilampaui oleh 95% RPC, sebagai konteks variasi.
- **Error:** RPC yang gagal. Periksa alamat, koneksi, dan log bila nilainya bukan nol.

## Hasil pengukuran

Dijalankan pada 4 November 2026, sekitar 20:54 WIB, Node.js v24.15.0, server `localhost:50051`, satu server melalui loopback. Dataset memakai `results/benchmark-reservations.json` terpisah sehingga data reservasi demo utama tidak berubah.

| Client bersamaan | Total request | Berhasil | Error | Rata-rata (ms) | p95 (ms) | Durasi (s) | Throughput (req/s) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 100 | 100 | 0 | 2.123 | 3.107 | 0.213 | 468.98 |
| 5 | 100 | 100 | 0 | 4.554 | 7.553 | 0.092 | 1,087.60 |
| 20 | 100 | 100 | 0 | 14.062 | 21.317 | 0.075 | 1,332.35 |

| Perebutan kursi | Client | Confirmed | Seat unavailable | Error RPC | Rata-rata (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| A1, show-001 | 20 | 1 | 19 | 0 | 42.098 |

Semua 300 RPC pengukuran berhasil. Saat jumlah client bertambah, throughput naik pada pengukuran ini, sementara latensi rata-rata dan p95 juga naik. Ini satu kali pengukuran lokal, bukan klaim kapasitas maksimum; ulangi di lingkungan demo kelompok sebelum membandingkan mesin.

Berkas mentah: `results/load-test-2026-11-04T13-54-45-431Z.json` dan `results/load-test-2026-11-04T13-54-45-431Z.csv`.

## Langkah demo singkat

1. Tunjukkan satu server berjalan dan alamat target.
2. Jalankan `npm run benchmark`; jelaskan setiap skenario memakai total request yang sama.
3. Tampilkan metrik terminal dan buka CSV/JSON.
4. Tunjukkan hasil kontensi: satu reservasi menang, 19 permintaan mendapat status kursi tidak tersedia.
5. Panggil `GetSeatMap` atau tunjukkan peta kursi untuk memperlihatkan kursi pemenang terisi.
6. Simpulkan perubahan metrik berdasarkan angka terukur dan sebutkan kondisi mesin/jaringan.

## Contoh kesimpulan laporan

> Pada runtime Node.js v24.15.0, server lokal diuji dengan 100 request `GetSeatMap` tiap skenario. Latensi rata-rata pada 1/5/20 client adalah 2.123/4.554/14.062 ms; throughput 468.98/1,087.60/1,332.35 req/s. Uji kontensi 20 client menghasilkan 1 reservasi berhasil, 19 penolakan kursi terisi, dan 0 error. Hasil berlaku untuk kondisi lokal loopback tersebut.

## Batas pengujian

Benchmark mengukur satu server Node.js dan penyimpanan JSON lokal. Pengujian ini tidak mengukur beberapa replika, kapasitas jangka panjang, atau variasi jaringan internet.

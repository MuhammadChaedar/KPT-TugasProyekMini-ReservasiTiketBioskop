"use strict";
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const ADDRESS = process.env.GRPC_ADDRESS || "localhost:50051";
const TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 3000);
const MAX_RETRIES = Number(process.env.RPC_MAX_RETRIES || 2);
const definition = protoLoader.loadSync(path.resolve(__dirname, "../proto/cinema.proto"), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const CinemaService = grpc.loadPackageDefinition(definition).cinema.v1.CinemaService;
const client = new CinemaService(ADDRESS, grpc.credentials.createInsecure());
const rl = readline.createInterface({ input, output });

function unary(method, request, retry = true) {
  const attempts = retry ? MAX_RETRIES + 1 : 1;
  return new Promise((resolve, reject) => {
    const attempt = (number) => client[method](request, { deadline: new Date(Date.now() + TIMEOUT_MS) }, (error, response) => {
      if (!error) return resolve(response);
      const canRetry = [grpc.status.DEADLINE_EXCEEDED, grpc.status.UNAVAILABLE].includes(error.code);
      if (canRetry && number + 1 < attempts) {
        const delay = Math.min(250 * (2 ** number), 2000);
        console.warn(`RPC ${method} gagal; retry ${number + 1}/${attempts - 1} dalam ${delay} ms.`);
        return setTimeout(() => attempt(number + 1), delay);
      }
      reject(error);
    });
    attempt(0);
  });
}

async function choose(prompt, items, label) {
  items.forEach((item, i) => console.log(`${i + 1}. ${label(item)}`));
  const index = Number(await rl.question(prompt)) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error("Pilihan tidak valid.");
  return items[index];
}

async function main() {
  console.log(`Terhubung ke ${ADDRESS}`);
  const movies = (await unary("ListMovies", {})).movies;
  const movie = await choose("Pilih film: ", movies, (m) => `${m.title} (${m.duration_minutes} menit)`);
  const shows = (await unary("ListShowtimes", { movie_id: movie.movie_id })).showtimes;
  const show = await choose("Pilih jadwal: ", shows, (s) => `${s.showtime_id} — ${s.starts_at} — ${s.auditorium}`);
  const map = await unary("GetSeatMap", { showtime_id: show.showtime_id });
  console.log("\nPeta kursi (tersedia/terisi):");
  for (let row = 0; row < 5; row += 1) {
    console.log(map.seats.slice(row * 8, row * 8 + 8).map((s) => `${s.seat_id}:${s.status.endsWith("AVAILABLE") ? "A" : "T"}`).join("  "));
  }
  const seatId = (await rl.question("Kode kursi (mis. A1): ")).trim().toUpperCase();
  const customerId = (await rl.question("ID/nama pelanggan: ")).trim();
  if (!customerId) throw new Error("ID pelanggan wajib diisi.");
  // Satu ID per operasi logis; retry memakai objek request yang persis sama.
  const request = { request_id: randomUUID(), showtime_id: show.showtime_id, seat_id: seatId, customer_id: customerId };
  console.log(`ID permintaan: ${request.request_id}`);
  const result = await unary("ReserveSeat", request, true);
  console.log(`${result.message} Status: ${result.status}${result.reservation_id ? `; ID reservasi: ${result.reservation_id}` : ""}`);
}

main().catch((error) => {
  console.error(`Gagal: ${error.details || error.message || error}`);
  process.exitCode = 1;
}).finally(() => { rl.close(); client.close(); });

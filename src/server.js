"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const HOST = process.env.GRPC_HOST || "0.0.0.0";
const PORT = Number(process.env.GRPC_PORT || 50051);
const DATA_FILE = path.resolve(process.env.DATA_FILE || "data/reservations.json");
const PROTO_PATH = path.resolve(__dirname, "../proto/cinema.proto");

const movies = [
  { movie_id: "film-001", title: "Demo: Petualangan", duration_minutes: 110 },
  { movie_id: "film-002", title: "Demo: Luar Angkasa", duration_minutes: 125 },
];
const showtimes = [
  { showtime_id: "show-001", movie_id: "film-001", starts_at: "2026-11-05T19:00:00+07:00", auditorium: "Studio 1" },
  { showtime_id: "show-002", movie_id: "film-002", starts_at: "2026-11-05T20:00:00+07:00", auditorium: "Studio 2" },
];
const seatIds = Array.from({ length: 5 }, (_, row) =>
  Array.from({ length: 8 }, (_, col) => `${String.fromCharCode(65 + row)}${col + 1}`),
).flat();

let state = { reservations: [], requests: {} };
let lockTail = Promise.resolve();
const watchers = new Map();

function withReservationLock(action) {
  const result = lockTail.then(action);
  lockTail = result.then(() => undefined, () => undefined);
  return result;
}

function seatMap(showtimeId, source = state) {
  const reserved = new Set(source.reservations
    .filter((reservation) => reservation.showtime_id === showtimeId)
    .map((reservation) => reservation.seat_id));
  return seatIds.map((seat_id) => ({
    seat_id,
    status: reserved.has(seat_id) ? "SEAT_STATUS_RESERVED" : "SEAT_STATUS_AVAILABLE",
  }));
}

async function persist(nextState) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const temporaryFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, DATA_FILE);
}

function publishSeatMap(showtimeId) {
  const clients = watchers.get(showtimeId);
  if (!clients) return;
  const update = {
    showtime_id: showtimeId,
    seats: seatMap(showtimeId),
    updated_at: new Date().toISOString(),
  };
  for (const call of clients) call.write(update);
}

function callbackUnary(work, call, callback) {
  Promise.resolve().then(work).then(
    (response) => callback(null, response),
    (error) => callback(error),
  );
}

const service = {
  ListMovies(_call, callback) {
    callback(null, { movies });
  },

  ListShowtimes(call, callback) {
    const { movie_id } = call.request;
    if (movie_id && !movies.some((movie) => movie.movie_id === movie_id)) {
      return callback({ code: grpc.status.NOT_FOUND, details: "Film tidak ditemukan." });
    }
    callback(null, { showtimes: showtimes.filter((item) => !movie_id || item.movie_id === movie_id) });
  },

  GetSeatMap(call, callback) {
    const { showtime_id } = call.request;
    if (!showtimes.some((item) => item.showtime_id === showtime_id)) {
      return callback({ code: grpc.status.NOT_FOUND, details: "Jadwal tayang tidak ditemukan." });
    }
    callback(null, { showtime_id, seats: seatMap(showtime_id) });
  },

  ReserveSeat(call, callback) {
    const request = call.request;
    callbackUnary(async () => {
      if (!request.request_id || !request.showtime_id || !request.seat_id || !request.customer_id) {
        throw { code: grpc.status.INVALID_ARGUMENT, details: "request_id, showtime_id, seat_id, dan customer_id wajib diisi." };
      }
      if (!showtimes.some((item) => item.showtime_id === request.showtime_id)) {
        throw { code: grpc.status.NOT_FOUND, details: "Jadwal tayang tidak ditemukan." };
      }
      if (!seatIds.includes(request.seat_id)) {
        throw { code: grpc.status.INVALID_ARGUMENT, details: "Kode kursi tidak valid." };
      }

      return withReservationLock(async () => {
        const fingerprint = JSON.stringify([request.showtime_id, request.seat_id, request.customer_id]);
        const previous = state.requests[request.request_id];
        if (previous) {
          if (previous.fingerprint !== fingerprint) {
            throw { code: grpc.status.ALREADY_EXISTS, details: "request_id sudah pernah dipakai untuk payload berbeda." };
          }
          return previous.response;
        }

        const occupied = state.reservations.some((reservation) =>
          reservation.showtime_id === request.showtime_id && reservation.seat_id === request.seat_id,
        );
        const response = occupied
          ? {
              request_id: request.request_id,
              status: "RESERVATION_STATUS_SEAT_UNAVAILABLE",
              reservation_id: "",
              message: "Kursi sudah dipesan oleh client lain.",
            }
          : {
              request_id: request.request_id,
              status: "RESERVATION_STATUS_CONFIRMED",
              reservation_id: `res-${request.request_id}`,
              message: "Reservasi berhasil.",
            };

        const nextState = {
          reservations: occupied ? state.reservations : [
            ...state.reservations,
            {
              reservation_id: response.reservation_id,
              request_id: request.request_id,
              showtime_id: request.showtime_id,
              seat_id: request.seat_id,
              customer_id: request.customer_id,
              created_at: new Date().toISOString(),
            },
          ],
          requests: {
            ...state.requests,
            [request.request_id]: { fingerprint, response },
          },
        };
        await persist(nextState);
        state = nextState;
        if (!occupied) publishSeatMap(request.showtime_id);
        return response;
      });
    }, call, callback);
  },

  WatchSeatMap(call) {
    const { showtime_id } = call.request;
    if (!showtimes.some((item) => item.showtime_id === showtime_id)) {
      call.emit("error", { code: grpc.status.NOT_FOUND, details: "Jadwal tayang tidak ditemukan." });
      return;
    }
    if (!watchers.has(showtime_id)) watchers.set(showtime_id, new Set());
    watchers.get(showtime_id).add(call);
    call.write({ showtime_id, seats: seatMap(showtime_id), updated_at: new Date().toISOString() });

    const removeWatcher = () => {
      const clients = watchers.get(showtime_id);
      if (!clients) return;
      clients.delete(call);
      if (clients.size === 0) watchers.delete(showtime_id);
    };
    call.on("cancelled", removeWatcher);
    call.on("close", removeWatcher);
  },
};

async function main() {
  try {
    const saved = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    if (Array.isArray(saved.reservations) && saved.requests && typeof saved.requests === "object") {
      state = saved;
    } else {
      throw new Error("Struktur data reservasi tidak valid.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await persist(state);
  }

  const definition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const cinema = grpc.loadPackageDefinition(definition).cinema.v1;
  const server = new grpc.Server();
  server.addService(cinema.CinemaService.service, service);
  server.bindAsync(`${HOST}:${PORT}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
    if (error) throw error;
    console.log(`Cinema gRPC server listening on ${HOST}:${boundPort}`);
  });
}

main().catch((error) => {
  console.error("Gagal menjalankan server:", error);
  process.exitCode = 1;
});

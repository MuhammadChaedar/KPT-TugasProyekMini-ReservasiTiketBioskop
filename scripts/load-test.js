"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const ADDRESS = process.env.GRPC_ADDRESS || "localhost:50051";
const CLIENTS = (process.env.BENCH_CLIENTS || "1,5,20").split(",").map(Number);
const REQUESTS = Number(process.env.BENCH_REQUESTS || 100);
const SHOWTIME_ID = process.env.BENCH_SHOWTIME || "show-001";
const OUTPUT_DIR = path.resolve(process.env.BENCH_OUTPUT || "results");
const definition = protoLoader.loadSync(path.resolve(__dirname, "../proto/cinema.proto"), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const CinemaService = grpc.loadPackageDefinition(definition).cinema.v1.CinemaService;

function call(client, method, request) {
  const started = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    client[method](request, { deadline: new Date(Date.now() + 10000) }, (error, response) => {
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (error) reject(Object.assign(error, { latencyMs }));
      else resolve({ response, latencyMs });
    });
  });
}

async function benchmark(concurrency) {
  const clients = Array.from({ length: concurrency }, () => new CinemaService(ADDRESS, grpc.credentials.createInsecure()));
  let nextRequest = 0;
  const latencies = [];
  const errors = [];
  const started = process.hrtime.bigint();
  await Promise.all(clients.map(async (client) => {
    while (true) {
      const index = nextRequest++;
      if (index >= REQUESTS) return;
      try {
        const result = await call(client, "GetSeatMap", { showtime_id: SHOWTIME_ID });
        latencies.push(result.latencyMs);
      } catch (error) {
        if (error.latencyMs !== undefined) latencies.push(error.latencyMs);
        errors.push({ code: error.code, message: error.details || error.message });
      }
    }
  }));
  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  clients.forEach((client) => client.close());
  const sorted = [...latencies].sort((a, b) => a - b);
  const averageLatencyMs = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
  return {
    concurrentClients: concurrency,
    requests: REQUESTS,
    successfulResponses: REQUESTS - errors.length,
    errors: errors.length,
    averageLatencyMs: Number(averageLatencyMs.toFixed(3)),
    p95LatencyMs: Number((sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] || 0).toFixed(3)),
    elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
    throughputRps: Number(((REQUESTS - errors.length) / elapsedSeconds).toFixed(2)),
    errorDetails: errors.slice(0, 5),
  };
}

async function contend() {
  const observer = new CinemaService(ADDRESS, grpc.credentials.createInsecure());
  const { response: map } = await call(observer, "GetSeatMap", { showtime_id: SHOWTIME_ID });
  const seat = map.seats.find((item) => item.status === "SEAT_STATUS_AVAILABLE");
  observer.close();
  if (!seat) throw new Error(`Tidak ada kursi kosong di ${SHOWTIME_ID}; pilih jadwal lain dengan BENCH_SHOWTIME.`);

  const clients = Array.from({ length: 20 }, () => new CinemaService(ADDRESS, grpc.credentials.createInsecure()));
  const started = process.hrtime.bigint();
  const results = await Promise.all(clients.map(async (client, index) => {
    const request = {
      request_id: randomUUID(), showtime_id: SHOWTIME_ID, seat_id: seat.seat_id,
      customer_id: `load-client-${index + 1}`,
    };
    try {
      const { response, latencyMs } = await call(client, "ReserveSeat", request);
      return { status: response.status, latencyMs };
    } catch (error) {
      return { status: "RPC_ERROR", error: error.details || error.message, latencyMs: error.latencyMs };
    }
  }));
  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  clients.forEach((client) => client.close());
  const confirmed = results.filter((result) => result.status === "RESERVATION_STATUS_CONFIRMED").length;
  const unavailable = results.filter((result) => result.status === "RESERVATION_STATUS_SEAT_UNAVAILABLE").length;
  const report = {
    test: "same-seat-contention", showtimeId: SHOWTIME_ID, seatId: seat.seat_id,
    clients: results.length, confirmed, seatUnavailable: unavailable,
    rpcErrors: results.length - confirmed - unavailable,
    averageLatencyMs: Number((results.reduce((sum, result) => sum + (result.latencyMs || 0), 0) / results.length).toFixed(3)),
    elapsedSeconds: Number(elapsedSeconds.toFixed(3)), results,
  };
  if (confirmed !== 1 || unavailable !== 19) {
    throw new Error(`Invariant gagal untuk ${seat.seat_id}: confirmed=${confirmed}, unavailable=${unavailable}; ${JSON.stringify(report)}`);
  }
  return report;
}

async function main() {
  if (!CLIENTS.length || CLIENTS.some((value) => !Number.isInteger(value) || value < 1) || !Number.isInteger(REQUESTS) || REQUESTS < 1) {
    throw new Error("BENCH_CLIENTS harus berupa daftar bilangan positif dan BENCH_REQUESTS bilangan positif.");
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results = {
    address: ADDRESS, showtimeId: SHOWTIME_ID, operation: "GetSeatMap",
    generatedAt: new Date().toISOString(), scenarios: [], contention: null,
  };
  for (const count of CLIENTS) {
    const result = await benchmark(count);
    results.scenarios.push(result);
    console.log(`${count} client: avg ${result.averageLatencyMs} ms, p95 ${result.p95LatencyMs} ms, ${result.throughputRps} req/s, errors ${result.errors}`);
  }
  results.contention = await contend();
  console.log(`Rebutan ${results.contention.seatId}: ${results.contention.confirmed} confirmed, ${results.contention.seatUnavailable} unavailable, ${results.contention.rpcErrors} RPC error`);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonFile = path.join(OUTPUT_DIR, `load-test-${timestamp}.json`);
  const csvFile = path.join(OUTPUT_DIR, `load-test-${timestamp}.csv`);
  await fs.writeFile(jsonFile, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  const header = "clients,requests,successes,errors,average_latency_ms,p95_latency_ms,elapsed_seconds,throughput_rps";
  const rows = results.scenarios.map((item) => [item.concurrentClients, item.requests, item.successfulResponses, item.errors, item.averageLatencyMs, item.p95LatencyMs, item.elapsedSeconds, item.throughputRps].join(","));
  await fs.writeFile(csvFile, `${header}\n${rows.join("\n")}\n`, "utf8");
  console.log(`Hasil disimpan: ${jsonFile} dan ${csvFile}`);
}

main().catch((error) => {
  console.error(`Pengujian gagal: ${error.details || error.message || error}`);
  process.exitCode = 1;
});

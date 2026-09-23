/* eslint-disable no-console */
const autocannon = require("autocannon");

const url = process.env.LOADTEST_URL || "http://localhost:5000/health";
const connections = Number(process.env.LOADTEST_CONNECTIONS || 100);
const duration = Number(process.env.LOADTEST_DURATION || 10);

const instance = autocannon({
  url,
  method: "GET",
  connections,
  duration,
  pipelining: 1,
});

const startedAt = Date.now();

console.log("==========================================");
console.log("EthVote Backend Load Test Started");
console.log(`Target      : ${url}`);
console.log(`Connections : ${connections}`);
console.log(`Duration    : ${duration}s`);
console.log("==========================================");

autocannon.track(instance, {
  renderProgressBar: true,
  renderLatencyTable: true,
  renderResultsTable: true,
});

instance.on("tick", () => {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  process.stdout.write(`\rRunning... ${elapsed}s elapsed`);
});

instance.on("done", (result) => {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log("\n\n==========================================");
  console.log("EthVote Backend Load Test Finished");
  console.log("==========================================");

  const summary = [
    {
      metric: "Latency Avg (ms)",
      value: Number(result.latency.average || 0).toFixed(2),
    },
    {
      metric: "Latency P99 (ms)",
      value: Number(result.latency.p99 || 0).toFixed(2),
    },
    {
      metric: "Req/Sec Avg",
      value: Number(result.requests.average || 0).toFixed(2),
    },
    {
      metric: "Total Requests",
      value: result.requests.total || 0,
    },
    {
      metric: "Throughput Avg (MB/s)",
      value: (Number(result.throughput.average || 0) / (1024 * 1024)).toFixed(3),
    },
    {
      metric: "Total Errors",
      value: result.errors || 0,
    },
    {
      metric: "Total Timeouts",
      value: result.timeouts || 0,
    },
    {
      metric: "Non-2xx Responses",
      value: result.non2xx || 0,
    },
    {
      metric: "Test Duration (s)",
      value: elapsed,
    },
  ];

  console.table(summary);
});

instance.on("error", (err) => {
  console.error("\nLoad test error:", err.message);
  process.exitCode = 1;
});

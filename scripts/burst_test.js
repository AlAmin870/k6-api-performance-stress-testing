// Burst test: 50 virtual users fire one request each at the same moment.
// Used for "Run 1" in the README against a private API whose URL is not published.
//
//   k6 run -e TARGET_URL=https://your-api/endpoint scripts/burst_test.js
import http from "k6/http";
import { check } from "k6";

const URL = __ENV.TARGET_URL;
if (!URL) {
  throw new Error("Set the endpoint with: k6 run -e TARGET_URL=https://... scripts/burst_test.js");
}

export const options = {
  scenarios: {
    burst: {
      executor: "shared-iterations",
      vus: 50,
      iterations: 50,
      maxDuration: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate==1.0"],
  },
};

function parse(res) {
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

export default function () {
  const res = http.post(URL, null, { headers: { "Content-Type": "application/json" } });
  const body = parse(res);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "body status is Success": () => body !== null && body.status === "Success",
    "has hostServerName": () => body !== null && body.hostServerName !== undefined,
  });
}

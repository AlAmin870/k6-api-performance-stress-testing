import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 50,
  iterations: 50,  
  duration: "30s",  
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

const URL =
  "https:...(ACtual URL)..;

export default function () {
  const params = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  const res = http.post(URL, null, params);

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "response has status field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === "Success";
      } catch {
        return false;
      }
    },
    "has hostServerName": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.hostServerName !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    const body = JSON.parse(res.body);
    console.log(
      `VU ${__VU} | Server: ${body.hostServerName} | IP: ${body.clientIP} | Time: ${body.requestTime} | Duration: ${res.timings.duration.toFixed(0)}ms`
    );
  } else {
    console.error(
      `VU ${__VU} | FAILED | Status: ${res.status} | Body: ${res.body}`
    );
  }

  sleep(0);
}
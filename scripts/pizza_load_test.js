// Load and stress test for QuickPizza, Grafana's public demo API built for k6 practice.
//
//   k6 run scripts/pizza_load_test.js                      # smoke: 1 VU, 30s (default, used in CI)
//   k6 run -e PROFILE=load scripts/pizza_load_test.js      # ramp to 20 VUs and hold
//   k6 run -e PROFILE=stress scripts/pizza_load_test.js    # step up to 100 VUs to find the breaking point
//   k6 run -e BASE_URL=http://localhost:3333 ...           # point at a local QuickPizza container
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";

const BASE_URL = __ENV.BASE_URL || "https://quickpizza.grafana.com";
const PROFILE = __ENV.PROFILE || "smoke";
// QuickPizza accepts any 16-character token for anonymous users
const HEADERS = { "Content-Type": "application/json", Authorization: "token abcdef0123456789" };

const PROFILES = {
  smoke: [{ duration: "30s", target: 1 }],
  load: [
    { duration: "30s", target: 20 }, // ramp up
    { duration: "2m", target: 20 },  // steady state
    { duration: "30s", target: 0 },  // ramp down
  ],
  stress: [
    { duration: "30s", target: 25 },
    { duration: "1m", target: 25 },
    { duration: "30s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 100 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
};

// Custom metrics: business-level timing and correctness, not just HTTP status
const pizzaDuration = new Trend("pizza_recommendation_duration", true);
const ruleViolations = new Rate("pizza_rule_violations");

export const options = {
  scenarios: {
    [PROFILE]: { executor: "ramping-vus", startVUs: 0, stages: PROFILES[PROFILE] },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:toppings}": ["p(95)<500"],
    pizza_recommendation_duration: ["p(95)<1000", "p(99)<2000"],
    pizza_rule_violations: ["rate==0"],
    checks: ["rate>0.99"],
  },
};

function randomRestrictions() {
  return {
    maxCaloriesPerSlice: 500 + Math.floor(Math.random() * 1000),
    mustBeVegetarian: Math.random() < 0.3,
    excludedIngredients: [],
    excludedTools: [],
    maxNumberOfToppings: 6,
    minNumberOfToppings: 2,
  };
}

function parse(res) {
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

export default function () {
  group("browse toppings", () => {
    const res = http.get(`${BASE_URL}/api/ingredients/topping`, {
      headers: HEADERS,
      tags: { endpoint: "toppings" },
    });
    const body = parse(res);
    check(res, {
      "toppings: status 200": (r) => r.status === 200,
      "toppings: list not empty": () => body !== null && body.ingredients.length > 0,
    });
  });

  group("get pizza recommendation", () => {
    const restrictions = randomRestrictions();
    const res = http.post(`${BASE_URL}/api/pizza`, JSON.stringify(restrictions), {
      headers: HEADERS,
      tags: { endpoint: "pizza" },
    });
    pizzaDuration.add(res.timings.duration);

    const pizza = (parse(res) || {}).pizza;
    const ingredients = pizza ? pizza.ingredients : [];
    // QuickPizza returns the dough plus 1-2 base ingredients alongside the toppings,
    // so the vegetarian rule is the reliable business check here.
    const vegetarianOk = !restrictions.mustBeVegetarian || ingredients.every((i) => i.vegetarian);

    check(res, {
      "pizza: status 200": (r) => r.status === 200,
      "pizza: has name and dough": () => pizza !== undefined && pizza.name && pizza.dough,
      "pizza: vegetarian rule respected": () => vegetarianOk,
    });
    ruleViolations.add(!vegetarianOk);
  });

  sleep(1); // think time between user journeys
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    [`reports/${PROFILE}-summary.json`]: JSON.stringify(data, null, 2),
  };
}

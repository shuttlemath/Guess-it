const https = require("https");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function httpsGet(path, apiKey) {
  const options = {
    hostname: "api.nowpayments.io",
    port: 443,
    path,
    method: "GET",
    headers: { "x-api-key": apiKey },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.rawQuery || "");
    const id = params.get("id");
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfig: NOWPAYMENTS_API_KEY missing" }) };
    }

    const resp = await httpsGet(`/v1/payment/${encodeURIComponent(id)}`, apiKey);

    if (!resp.json) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Upstream non-JSON", upstream: resp.text?.slice(0, 200) }) };
    }

    let status = "pending";
    const p = resp.json;
    if (p.payment_status === "finished") status = "confirmed";
    else if (p.payment_status === "failed") status = "failed";

    return { statusCode: 200, headers, body: JSON.stringify({ status, raw: p }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

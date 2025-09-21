const https = require("https");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

// helper: HTTPS request (no external deps)
function httpsRequest({ method, path, bodyObj, apiKey }) {
  const options = {
    hostname: "api.nowpayments.io",
    port: 443,
    path,
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
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
    if (bodyObj) req.write(JSON.stringify(bodyObj));
    req.end();
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { network, amount, coins } = JSON.parse(event.body || "{}");
    if (!network || !amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request: missing network/amount" }) };
    }

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfig: NOWPAYMENTS_API_KEY missing" }) };
    }

    // برای حذف نیاز به estimate، هر دو currency را یکسان می‌گیریم
    const payCurrency = network === "TRON" ? "USDTTRC20" : "USDTPOLYGON";

    const bodyObj = {
      price_amount: Number(amount),    // مثلاً 1.50 یا 14.85
      price_currency: payCurrency,     // = USDTTRC20
      pay_currency: payCurrency,       // = USDTTRC20
      order_id: `order_${Date.now()}`,
    };

    const resp = await httpsRequest({
      method: "POST",
      path: "/v1/payment",
      bodyObj,
      apiKey,
    });

    // اگر upstream JSON نباشد
    if (!resp.json) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Upstream non-JSON", upstream: resp.text?.slice(0, 200) }) };
    }

    if (resp.status < 200 || resp.status >= 300) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: "NOWPayments error", details: resp.json }) };
    }

    const data = resp.json;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: data.payment_id || data.id,
        address: data.pay_address || data.invoice_url || null,
        memo: data.pay_memo || null,
        coins: coins ?? null,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

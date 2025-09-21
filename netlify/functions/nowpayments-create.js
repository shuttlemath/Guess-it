const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

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

    const payCurrency = network === "TRON" ? "USDTTRC20" : "USDTPOLYGON";

    const resp = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: Number(amount),
        price_currency: "USDT",
        pay_currency: payCurrency,
        order_id: `order_${Date.now()}`,
      }),
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch {
      // NOWPayments sometimes returns HTML on error → surface it
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Upstream non-JSON", upstream: text.slice(0, 200) }) };
    }

    if (!resp.ok) {
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: "NOWPayments error", details: data }) };
    }

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

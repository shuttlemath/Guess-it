const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.rawQuery || "");
    const id = params.get("id");
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfig: NOWPAYMENTS_API_KEY missing" }) };
    }

    const resp = await fetch(`https://api.nowpayments.io/v1/payment/${id}`, {
      headers: { "x-api-key": apiKey },
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Upstream non-JSON", upstream: text.slice(0, 200) }) };
    }

    let status = "pending";
    if (data.payment_status === "finished") status = "confirmed";
    else if (data.payment_status === "failed") status = "failed";

    return { statusCode: 200, headers, body: JSON.stringify({ status, raw: data }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

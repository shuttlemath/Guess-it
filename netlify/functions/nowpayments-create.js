export async function handler(event) {
  try {
    const { network, amount, coins } = JSON.parse(event.body || "{}");
    if (!network || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: "Bad request" }) };
    }

    const r = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "USDT",
        pay_currency: network === "TRON" ? "USDTTRC20" : "USDTPOLYGON",
        order_id: `order_${Date.now()}`
      }),
    });
    const data = await r.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: data.payment_id || data.id,
        address: data.pay_address || data.invoice_url,
        memo: data.pay_memo || null,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

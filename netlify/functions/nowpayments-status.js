export async function handler(event) {
  try {
    const id = new URLSearchParams(event.rawQuery || "").get("id");
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };

    const r = await fetch(`https://api.nowpayments.io/v1/payment/${id}`, {
      headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY },
    });
    const data = await r.json();

    let status = "pending";
    if (data.payment_status === "finished") status = "confirmed";
    else if (data.payment_status === "failed") status = "failed";

    return { statusCode: 200, body: JSON.stringify({ status }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

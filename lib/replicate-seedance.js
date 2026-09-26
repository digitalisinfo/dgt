const MODEL_URL = "https://api.replicate.com/v1/models/bytedance/seedance-2.5/predictions";

function token() {
  const value = process.env.REPLICATE_API_TOKEN || "";
  if (!value) {
    const error = new Error("Defina REPLICATE_API_TOKEN no arquivo .env e reinicie o servidor.");
    error.status = 500;
    throw error;
  }
  return value;
}

async function readError(res) {
  try {
    const data = await res.json();
    const detail = data?.detail || data?.error || data?.title;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    /* ignore */
  }
  if (res.status === 401) return "Token do Replicate recusado. Confira REPLICATE_API_TOKEN.";
  if (res.status === 402) return "A conta do Replicate está sem crédito.";
  return `Replicate respondeu ${res.status}.`;
}

export async function uploadToReplicate(buffer, filename, mime) {
  const form = new FormData();
  form.append("content", new Blob([buffer], { type: mime || "application/octet-stream" }), filename || "file");
  const res = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const url = data?.urls?.get || data?.url;
  if (!url) throw new Error("O Replicate não devolveu a URL do arquivo.");
  const expiresAt = data.expires_at || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  return { url, expiresAt };
}

export async function createSeedancePrediction(input) {
  const res = await fetch(MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getPrediction(id) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function cancelPrediction(id) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export function predictionOutputUrl(prediction) {
  const out = prediction?.output;
  if (typeof out === "string") return out;
  if (Array.isArray(out) && typeof out[0] === "string") return out[0];
  if (out && typeof out === "object" && typeof out.url === "string") return out.url;
  return "";
}

export async function downloadRemote(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não consegui baixar o vídeo gerado (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export function replicateConfigured() {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

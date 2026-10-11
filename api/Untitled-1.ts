import { handleUpdate } from "../server/telegram.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  try {
    await handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[schoolmind-telegram] webhook failed");
    return res.status(500).json({ ok: false });
  }
}

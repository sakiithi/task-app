// 📸 写真からごはんの中身とカロリーを推測する（Supabase Edge Function: food-photo）
// - アプリ（body.html）から { image: base64, media_type, meal? } を受け取る
// - Claude に写真を見せて、品目ごとの kcal・たんぱく質・脂質・炭水化物のめやすを JSON で返す
// - ANTHROPIC_API_KEY は Supabase の Secrets に入れる（コードやリポジトリには書かない）
// - 「Verify JWT」をオンのままにする → ログインした人（キキチさん）だけが使える
import Anthropic from "npm:@anthropic-ai/sdk";

const ALLOW_ORIGIN = "https://sakiithi.github.io";
const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "料理・食品の名前（日本語）" },
          emoji: { type: "string", description: "合う絵文字1つ" },
          amount: { type: "string", description: "写真から見た量のめやす（例：茶碗1杯、3個、1皿）" },
          kcal: { type: "number" },
          p: { type: "number", description: "たんぱく質 g" },
          f: { type: "number", description: "脂質 g" },
          c: { type: "number", description: "炭水化物 g" },
        },
        required: ["name", "emoji", "amount", "kcal", "p", "f", "c"],
        additionalProperties: false,
      },
    },
    comment: { type: "string", description: "ひとことアドバイス（やさしい日本語で40文字くらい）" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["items", "comment", "confidence"],
  additionalProperties: false,
};

const PROMPT = `この写真の食事に写っている料理・飲みものを、品目ごとに分けて推測してください。
- 日本の一般的なレシピと、写真から見える量（器の大きさ・個数）をもとに、1品ずつ kcal・たんぱく質(p)・脂質(f)・炭水化物(c) をグラムで見積もる
- ご飯・味噌汁・おかずのように分けられるものは分ける。セットや定食でも中身ごとに分ける
- 数字は「だいたい」でよいが、ありえない値にしない。量がはっきりしないときはふつうの1人前とする
- 食べものが写っていないときは items を空にし、comment でそのことを伝える
- comment はやさしい日本語で、責めない、前向きなひとこと（例：たんぱく質がしっかりとれてるね）`;

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const { image, media_type } = await req.json();
    if (typeof image !== "string" || image.length < 100) return json({ error: "写真がないよ" }, 400);
    if (image.length > 7_000_000) return json({ error: "写真が大きすぎるよ" }, 400);
    const mt = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(media_type) ? media_type : "image/jpeg";

    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mt, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    });

    if (response.stop_reason === "refusal") return json({ error: "この写真は読み取れなかったよ" }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "うまく読み取れなかったよ。もう一度ためしてね" }, 502);
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const data = JSON.parse(text);
    return json({ ...data, model: response.model });
  } catch (e) {
    console.error(e);
    const status = e instanceof Anthropic.APIError ? 502 : 500;
    return json({ error: "AIにつながらなかったよ。少しあとでためしてね" }, status);
  }
});

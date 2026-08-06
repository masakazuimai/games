// AIフォールバック。ルール表で判定できなかった質問だけをAIに投げる。
// 既定はOFF。プレイヤーが明示的に有効化したときだけ呼ばれる。
// 1語だけ返させる用途なのでストリーミングは使わない。

export const AI_PROVIDERS = {
  off: {
    label: "OFF（ルール判定のみ）",
    needsKey: false,
  },
  gemini: {
    label: "Google Gemini（自分のキー）",
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    model: "gemini-2.5-flash",
  },
  groq: {
    label: "Groq（自分のキー）",
    needsKey: true,
    keyUrl: "https://console.groq.com/keys",
    model: "llama-3.3-70b-versatile",
  },
  claude: {
    label: "Claude（自分のキー）",
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    model: "claude-haiku-4-5",
  },
}

/**
 * プロンプトを投げて応答テキストを返す。
 * @param {{provider: string, prompt: string, apiKey?: string}} params
 * @returns {Promise<string>}
 */
export async function callAI({ provider, prompt, apiKey }) {
  const config = AI_PROVIDERS[provider]
  if (!config || provider === "off") throw new Error("AI判定は無効です")
  if (!prompt) throw new Error("プロンプトが空です")

  switch (provider) {
    case "gemini":
      return callGemini({ model: config.model, prompt, apiKey })
    case "groq":
      return callGroq({ model: config.model, prompt, apiKey })
    case "claude":
      return callClaude({ model: config.model, prompt, apiKey })
    default:
      throw new Error(`未知のプロバイダ: ${provider}`)
  }
}

async function callGemini({ model, prompt, apiKey }) {
  if (!apiKey) throw new Error("Gemini のAPIキーが未設定です")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gemini APIエラー（${res.status}）: ${detail.slice(0, 160)}`)
  }
  const data = await res.json()
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")
  if (!text) throw new Error("Gemini: 応答が空です")
  return text
}

async function callGroq({ model, prompt, apiKey }) {
  if (!apiKey) throw new Error("Groq のAPIキーが未設定です")

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Groq APIエラー（${res.status}）: ${detail.slice(0, 160)}`)
  }
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content ?? ""
  if (!text) throw new Error("Groq: 応答が空です")
  return text
}

async function callClaude({ model, prompt, apiKey }) {
  if (!apiKey) throw new Error("Claude のAPIキーが未設定です")

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Claude APIエラー（${res.status}）: ${detail.slice(0, 160)}`)
  }
  const data = await res.json()
  const text = (data?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
  if (!text) throw new Error("Claude: 応答が空です")
  return text
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolDecl } from './tools/tool-definitions';

export interface GeminiMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface GeminiResult {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
  stub: boolean;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** A richer content representation used for function-calling turns.
 *  Each content item can contain text AND/OR function-call/response parts. */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    if (!this.apiKey) this.logger.warn('GEMINI_API_KEY not set — Gemini client runs in STUB mode.');
  }

  isStub(): boolean {
    return !this.apiKey;
  }

  // ===================== Legacy simple text generation =====================

  private buildBody(
    messages: GeminiMessage[],
    fastChat: boolean,
    tools?: ToolDecl[],
  ): Record<string, unknown> {
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const systemInstruction = messages.find((m) => m.role === 'system');
    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    if (fastChat) {
      body.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
    }
    if (tools?.length) body.tools = [{ functionDeclarations: tools }];
    return body;
  }

  async generate(messages: GeminiMessage[], fastChat = false): Promise<GeminiResult> {
    if (!this.apiKey) return this.stubReply(messages);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.buildBody(messages, fastChat)),
    });
    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Gemini API error ${res.status}: ${detail}`);
      throw new Error(`GEMINI_UPSTREAM_${res.status}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return {
      text,
      tokensIn: json.usageMetadata?.promptTokenCount,
      tokensOut: json.usageMetadata?.candidatesTokenCount,
      stub: false,
    };
  }

  // ===================== Tool-aware content generation =====================

  /** Non-streaming call that returns raw parts so the caller can dispatch
   *  functionCall parts before the final text answer. */
  async generateWithTools(params: {
    system: string;
    contents: GeminiContent[];
    tools: ToolDecl[];
  }): Promise<{ parts: GeminiPart[]; stub: boolean }> {
    if (!this.apiKey) return { parts: [{ text: this.stubChatReply(params.contents) }], stub: true };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body: Record<string, unknown> = {
      contents: params.contents,
      systemInstruction: { parts: [{ text: params.system }] },
      tools: [{ functionDeclarations: params.tools }],
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Gemini tools error ${res.status}: ${detail}`);
      throw new Error(`GEMINI_UPSTREAM_${res.status}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    return { parts, stub: false };
  }

  // ===================== Streaming (used for final answer, no tools) =====================

  async *stream(messages: GeminiMessage[], fastChat = true): AsyncGenerator<string> {
    if (!this.apiKey) {
      const r = this.stubReply(messages);
      for (const chunk of r.text.match(/.{1,40}/g) ?? [r.text]) {
        await new Promise((res) => setTimeout(res, 40));
        yield chunk;
      }
      return;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(this.buildBody(messages, fastChat)),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Gemini stream error ${res.status}: ${detail}`);
      throw new Error(`GEMINI_UPSTREAM_${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
          if (text) yield text;
        } catch {
          /* partial JSON — skip */
        }
      }
    }
  }

  /** Stream a pre-computed text as deltas — used when we resolved tool calls
   *  non-streaming and now want to surface the final answer progressively. */
  async *fakeStream(text: string, chunkSize = 40, delayMs = 25): AsyncGenerator<string> {
    for (const chunk of text.match(new RegExp(`.{1,${chunkSize}}`, 'gs')) ?? [text]) {
      await new Promise((res) => setTimeout(res, delayMs));
      yield chunk;
    }
  }

  // ===================== STUB helpers =====================

  private stubReply(messages: GeminiMessage[]): GeminiResult {
    const last = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const isInsight = last.includes('INSIGHTS_REQUEST');
    const text = isInsight
      ? JSON.stringify({
          summary: '[STUB] Tuần này tỉ lệ đi làm ổn định. Chưa cấu hình GEMINI_API_KEY.',
          highlights: ['Check-in đúng giờ 92%', 'Vắng có phép 3 ca', 'Đi muộn giảm 12% so với tuần trước'],
          recommendations: ['Nhắc ca sáng thứ Hai', 'Kiểm tra lý do vắng nhân sự ca tối'],
          anomalies: [],
        })
      : `[STUB mode] Xin chào! Gemini API chưa được cấu hình. Đây là câu trả lời mẫu cho: "${last.slice(0, 120)}".`;
    return { text, stub: true };
  }

  private stubChatReply(contents: GeminiContent[]): string {
    const last = [...contents].reverse().find((c) => c.role === 'user');
    const userText =
      last?.parts.find((p): p is { text: string } => 'text' in p && typeof p.text === 'string')?.text ??
      '(không có câu hỏi)';
    return `[STUB mode] Chưa cấu hình GEMINI_API_KEY nên không thể gọi tool thực. Câu hỏi của bạn: "${userText.slice(0, 120)}".`;
  }
}

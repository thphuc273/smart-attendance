import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-1.5-flash';
    if (!this.apiKey) this.logger.warn('GEMINI_API_KEY not set — Gemini client runs in STUB mode.');
  }

  isStub(): boolean {
    return !this.apiKey;
  }

  async generate(messages: GeminiMessage[]): Promise<GeminiResult> {
    if (!this.apiKey) return this.stubReply(messages);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const systemInstruction = messages.find((m) => m.role === 'system');
    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction.content }] };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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

  async *stream(messages: GeminiMessage[]): AsyncGenerator<string> {
    if (!this.apiKey) {
      const r = this.stubReply(messages);
      for (const chunk of r.text.match(/.{1,40}/g) ?? [r.text]) {
        await new Promise((res) => setTimeout(res, 40));
        yield chunk;
      }
      return;
    }
    const full = await this.generate(messages);
    for (const chunk of full.text.match(/.{1,60}/g) ?? [full.text]) yield chunk;
  }

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
}

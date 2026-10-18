import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from '../../common/http/post-json';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number | null;
  latencyMs: number;
}

interface GroqConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Thin Groq (OpenAI-compatible) chat client. Unconfigured or failing calls
 * return `null` so the chatbot can fall back to a catalog-only answer instead
 * of erroring in front of the customer.
 */
@Injectable()
export class GroqClient {
  private readonly logger = new Logger(GroqClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const ai = this.config.get<{ groq: GroqConfig }>('ai');
    return Boolean(ai?.groq.enabled && ai.groq.apiKey);
  }

  async complete(messages: ChatTurn[]): Promise<CompletionResult | null> {
    if (!this.isConfigured()) return null;
    const { baseUrl, apiKey, model } = this.cfg();
    const started = Date.now();

    try {
      const res = await postJson(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages,
          temperature: 0.3,
          max_tokens: 400,
        },
        { Authorization: `Bearer ${apiKey}` },
      );

      if (res.status >= 300) {
        this.logger.warn(`[groq] ${res.status}: ${JSON.stringify(res.json)}`);
        return null;
      }

      const choices = res.json.choices as { message?: { content?: string } }[] | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content) return null;

      const usage = res.json.usage as { total_tokens?: number } | undefined;
      return {
        content: content.trim(),
        provider: 'groq',
        model,
        tokensUsed: usage?.total_tokens ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      this.logger.warn(`[groq] request failed: ${(error as Error).message}`);
      return null;
    }
  }

  private cfg(): GroqConfig {
    return this.config.get<{ groq: GroqConfig }>('ai')!.groq;
  }
}

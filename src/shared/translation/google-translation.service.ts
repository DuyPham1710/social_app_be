import { Injectable, Logger } from '@nestjs/common';

interface TranslateResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

@Injectable()
export class GoogleTranslationService {
  private readonly logger = new Logger(GoogleTranslationService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://translation.googleapis.com/language/translate/v2';

  constructor() {
    this.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || '';
  }

  private ensureConfig() {
    if (!this.apiKey) {
      throw new Error('Google Translation API key is not configured');
    }
  }

  async detectLanguage(text: string): Promise<string> {
    if (!text || !text.trim()) return 'und';

    try {
      this.ensureConfig();

      const url = `${this.baseUrl}/detect?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`v2 detectLanguage error: ${res.status} ${res.statusText} - ${errorText}`);
        return 'und';
      }

      const data: any = await res.json();
      
      const lang = data?.data?.detections?.[0]?.[0]?.language;
      return lang || 'und';
    } catch (e) {
      this.logger.error('Error detecting language (v2)', e as any);
      return 'und';
    }
  }

  async translate(text: string, targetLang: string): Promise<TranslateResult> {
    if (!text || !text.trim()) {
      return { translatedText: '', sourceLang: 'und', targetLang };
    }

    try {
      this.ensureConfig();

      const url = `${this.baseUrl}?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          target: targetLang,
          format: 'text',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`v2 translate error: ${res.status} ${res.statusText} - ${errorText}`);
        throw new Error('Google Translation API error');
      }

      const data: any = await res.json();
      const t = data?.data?.translations?.[0];

      return {
        translatedText: t?.translatedText || '',
        sourceLang: t?.detectedSourceLanguage || 'und',
        targetLang,
      };
    } catch (error) {
      this.logger.error('Error translating text with Google Translation API', error as any);
      throw error;
    }
  }
}


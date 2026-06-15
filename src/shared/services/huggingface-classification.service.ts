import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { POST_CATEGORY_LABELS } from '../constants/post-categories.constant';
import { PostCategory } from '../enums/post-category.enum';
import {
  HuggingFaceZeroShotLabelScore,
  HuggingFaceZeroShotResponse,
} from '../interfaces/huggingface-zero-shot-response.interface';

export interface PostCategoryClassificationResult {
  category: PostCategory | null;
  confidence: number;
  isRecommendable: boolean;
  raw?: HuggingFaceZeroShotResponse;
}

@Injectable()
export class HuggingFaceClassificationService {
  private readonly logger = new Logger(HuggingFaceClassificationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async classifyPostCaption(
    caption: string,
  ): Promise<PostCategoryClassificationResult> {
    const trimmedCaption = caption?.trim() ?? '';
    if (!trimmedCaption) {
      return this.emptyResult();
    }

    const hfToken = this.getHuggingFaceToken();
    if (!hfToken) {
      this.logger.warn(
        'HUGGINGFACE_API_TOKEN chưa được cấu hình. Bỏ qua phân loại caption.',
      );
      return this.emptyResult();
    }

    const modelName = this.configService.get<string>(
      'HUGGINGFACE_ZERO_SHOT_MODEL',
      'facebook/bart-large-mnli',
    );
    const timeoutMs = this.getNumberConfig(
      'HUGGINGFACE_ZERO_SHOT_TIMEOUT_MS',
      10000,
    );
    const threshold = this.getNumberConfig(
      'POST_CATEGORY_CONFIDENCE_THRESHOLD',
      0.45,
    );
    const urls = this.getInferenceUrls(modelName);

    for (let attempt = 0; attempt < urls.length; attempt++) {
      const url = urls[attempt];

      try {
        const response = await this.httpService.axiosRef.post(
          url,
          {
            inputs: trimmedCaption,
            parameters: {
              candidate_labels: POST_CATEGORY_LABELS,
              multi_label: false,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
            },
            timeout: timeoutMs,
          },
        );

        const data = this.normalizeZeroShotResponse(
          response.data,
          trimmedCaption,
        );
        if (!data) {
          this.logger.error(
            `Phản hồi Hugging Face zero-shot không hợp lệ từ ${url}: ${JSON.stringify(response.data)}`,
          );
          return this.emptyResult();
        }

        const bestLabel = data.labels[0] as PostCategory;
        const bestScore = data.scores[0];
        const category = bestScore < threshold ? PostCategory.OTHER : bestLabel;

        return {
          category,
          confidence: bestScore,
          isRecommendable: bestScore >= threshold,
          raw: data,
        };
      } catch (error) {
        if (attempt < urls.length - 1 && this.shouldRetryWithFallback(error)) {
          this.logger.warn(
            `Không gọi được Hugging Face zero-shot tại ${url}. Thử fallback endpoint.`,
          );
          continue;
        }

        this.logHuggingFaceError(error, url);
        return this.emptyResult();
      }
    }

    return this.emptyResult();
  }

  private getHuggingFaceToken(): string {
    const token =
      this.configService.get<string>('HUGGINGFACE_API_TOKEN', '') ||
      this.configService.get<string>('HUGGINGFACE_ACCESS_TOKEN', '');

    return token.trim();
  }

  private getNumberConfig(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private getInferenceUrls(modelName: string): string[] {
    const primaryBaseUrl = this.normalizeBaseUrl(
      this.configService.get<string>(
        'HUGGINGFACE_ZERO_SHOT_BASE_URL',
        'https://api-inference.huggingface.co/models',
      ),
    );
    const fallbackBaseUrl = this.normalizeBaseUrl(
      this.configService.get<string>(
        'HUGGINGFACE_ZERO_SHOT_FALLBACK_BASE_URL',
        'https://router.huggingface.co/hf-inference/models',
      ),
    );

    return [
      ...new Set([
        `${primaryBaseUrl}/${modelName}`,
        `${fallbackBaseUrl}/${modelName}`,
      ]),
    ];
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
  }

  private normalizeZeroShotResponse(
    rawData: any,
    sequence: string,
  ): HuggingFaceZeroShotResponse | null {
    const data =
      Array.isArray(rawData) && rawData.length === 1 && rawData[0]?.labels
        ? rawData[0]
        : rawData;

    if (data?.labels && data?.scores) {
      return this.isValidZeroShotResponse(data) ? data : null;
    }

    if (Array.isArray(data) && this.isLabelScoreResponse(data)) {
      const normalized = {
        sequence,
        labels: data.map((item) => item.label),
        scores: data.map((item) => item.score),
      };

      return this.isValidZeroShotResponse(normalized) ? normalized : null;
    }

    return null;
  }

  private isLabelScoreResponse(
    data: any[],
  ): data is HuggingFaceZeroShotLabelScore[] {
    return data.every(
      (item) =>
        item &&
        typeof item.label === 'string' &&
        typeof item.score === 'number' &&
        Number.isFinite(item.score),
    );
  }

  private isValidZeroShotResponse(data: HuggingFaceZeroShotResponse): boolean {
    if (!Array.isArray(data.labels) || !Array.isArray(data.scores)) {
      return false;
    }

    if (data.labels.length === 0 || data.scores.length === 0) {
      return false;
    }

    const bestLabel = data.labels[0];
    const bestScore = data.scores[0];

    return (
      POST_CATEGORY_LABELS.includes(bestLabel as PostCategory) &&
      typeof bestScore === 'number' &&
      Number.isFinite(bestScore)
    );
  }

  private emptyResult(): PostCategoryClassificationResult {
    return {
      category: null,
      confidence: 0,
      isRecommendable: false,
    };
  }

  private shouldRetryWithFallback(error: any): boolean {
    const status = error?.response?.status;
    const code = error?.code;
    const responseData = error?.response?.data;
    const responseMessage =
      typeof responseData?.error === 'string' ? responseData.error : '';

    return (
      code === 'ENOTFOUND' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      status === 503 ||
      responseMessage.toLowerCase().includes('loading')
    );
  }

  private logHuggingFaceError(error: any, url: string): void {
    const status = error?.response?.status;
    const code = error?.code;
    const message = error?.message || 'Unknown Hugging Face error';

    this.logger.error(
      `Lỗi phân loại caption qua Hugging Face tại ${url}: status=${status ?? 'n/a'}, code=${code ?? 'n/a'}, message=${message}`,
    );

    if (error?.response?.data) {
      this.logger.error(
        `Chi tiết lỗi Hugging Face zero-shot: ${JSON.stringify(error.response.data)}`,
      );
    }
  }
}

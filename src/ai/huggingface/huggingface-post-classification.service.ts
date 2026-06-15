import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PostCategory } from 'src/common/enums/post-category.enum';
import { POST_CATEGORIES } from 'src/common/constants/post-categories.constant';
import { safeJsonParse } from 'src/common/utils/safe-json-parse.util';
import { HuggingFaceChatCompletionResponse } from './interfaces/huggingface-chat-completion-response.interface';

interface ParsedClassificationResponse {
    category?: unknown;
    confidence?: unknown;
}

@Injectable()
export class HuggingFacePostClassificationService {
    private readonly logger = new Logger(HuggingFacePostClassificationService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    async classifyCaptionWithAI(caption: string): Promise<{
        category: PostCategory | null;
        confidence: number;
        raw?: any;
    }> {
        const token = this.configService.get<string>('HUGGINGFACE_ACCESS_TOKEN', '').trim();
        const url = this.configService
            .get<string>('HUGGINGFACE_URL', 'https://router.huggingface.co/v1/chat/completions')
            .trim();
        const model = this.configService
            .get<string>('HUGGINGFACE_MODEL', 'Qwen/Qwen2.5-72B-Instruct')
            .trim();

        if (!token || !url || !model) {
            this.logger.warn('Hugging Face post classification env is missing. Skipping AI classification.');
            return { category: null, confidence: 0 };
        }

        try {
            const response = await this.httpService.axiosRef.post<HuggingFaceChatCompletionResponse>(
                url,
                {
                    model,
                    messages: [
                        {
                            role: 'system',
                            content: this.buildSystemPrompt(),
                        },
                        {
                            role: 'user',
                            content: this.buildUserPrompt(caption),
                        },
                    ],
                    temperature: 0,
                    max_tokens: 100,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                },
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                this.logger.warn('Hugging Face post classification returned an empty response.');
                return { category: null, confidence: 0, raw: response.data };
            }

            const parsed = safeJsonParse<ParsedClassificationResponse>(content);
            if (!parsed) {
                this.logger.warn(`Invalid Hugging Face classification JSON: ${content}`);
                return { category: null, confidence: 0, raw: content };
            }

            const category = this.parseCategory(parsed.category);
            const confidence = this.parseConfidence(parsed.confidence);

            if (!category || confidence === null) {
                this.logger.warn(`Invalid Hugging Face classification payload: ${JSON.stringify(parsed)}`);
                return { category: null, confidence: 0, raw: parsed };
            }

            return {
                category,
                confidence,
                raw: parsed,
            };
        } catch (error) {
            this.logger.error(`Hugging Face post classification failed: ${error.message}`);
            if (error.response?.data) {
                this.logger.error(`Hugging Face error detail: ${JSON.stringify(error.response.data)}`);
            }

            return { category: null, confidence: 0, raw: error.response?.data };
        }
    }

    private parseCategory(category: unknown): PostCategory | null {
        if (typeof category !== 'string') {
            return null;
        }

        const normalized = category.trim().toLowerCase() as PostCategory;
        return POST_CATEGORIES.includes(normalized) ? normalized : null;
    }

    private parseConfidence(confidence: unknown): number | null {
        const value = typeof confidence === 'number' ? confidence : Number(confidence);

        if (!Number.isFinite(value) || value < 0 || value > 1) {
            return null;
        }

        return value;
    }

    private buildSystemPrompt(): string {
        return `You are a Vietnamese social network post classification system.
Your task is to classify a user's post caption into exactly one category.
Return only valid JSON. Do not explain.`;
    }

    private buildUserPrompt(caption: string): string {
        return `Classify the following Vietnamese or English social network post caption into exactly one category.

Allowed categories:
study, travel, class_reunion, shopping, food, sports, music, movie, gaming, technology, work, family, friends, love, health, fashion, pet, news, event, funny, life, other

Category meanings:
study = học tập, trường học, bài tập, thi cử, đồ án
travel = du lịch, đi chơi xa, check-in địa điểm
class_reunion = họp lớp, gặp lại bạn cũ, kỷ niệm lớp học
shopping = mua sắm, sale, đặt hàng, sản phẩm
food = ăn uống, món ăn, nhà hàng, quán ăn
sports = thể thao, bóng đá, gym, chạy bộ
music = âm nhạc, bài hát, ca sĩ, concert
movie = phim ảnh, rạp phim, review phim
gaming = game, chơi game, livestream game
technology = công nghệ, lập trình, điện thoại, máy tính
work = công việc, công ty, deadline, dự án
family = gia đình, bố mẹ, anh chị em
friends = bạn bè, đi chơi với bạn
love = tình yêu, người yêu, crush
health = sức khỏe, bệnh, tập luyện, dinh dưỡng
fashion = thời trang, outfit, quần áo
pet = thú cưng, chó, mèo
news = tin tức, sự kiện xã hội
event = sự kiện, tiệc, sinh nhật, lễ hội
funny = hài hước, meme, vui vẻ
life = đời sống, tâm trạng, sinh hoạt hằng ngày
other = không rõ danh mục

Rules:

* Return only valid JSON.
* Do not explain.
* category must be one of the allowed categories.
* confidence must be a number from 0 to 1.
* If the caption is unclear, choose "other".
* If multiple categories match, choose the most specific one.
* Prefer food over life if the caption talks about eating or drinks.
* Prefer travel over friends if the caption talks about going to a place.
* Prefer class_reunion over friends if the caption mentions old classmates or class reunion.
* Prefer study over work if the caption talks about school, university, exam, assignment, or thesis.

Caption:
"${caption.trim()}"

Return JSON only:
{
"category": "travel",
"confidence": 0.86
}`;
    }
}

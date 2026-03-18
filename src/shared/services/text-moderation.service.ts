import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

export interface TextModerationResult {
    is_safe: boolean;
    violated_categories: {
        category: string;
        category_vi: string;
        confidence: number;
    }[];
    categories: Record<string, number>;
}

@Injectable()
export class TextModerationService {
    private readonly logger = new Logger(TextModerationService.name);
    private readonly hfToken: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.hfToken = this.configService.get<string>('HUGGINGFACE_ACCESS_TOKEN', '');
    }

    // Kiểm tra văn bản có vi phạm tiêu chuẩn cộng đồng
    async checkText(text: string): Promise<TextModerationResult> {
        if (!text || text.trim().length === 0) {
            return { is_safe: true, violated_categories: [], categories: {} };
        }

        if (!this.hfToken) {
            this.logger.warn('HUGGINGFACE_ACCESS_TOKEN chưa được cấu hình. Bỏ qua kiểm duyệt văn bản.');
            return { is_safe: true, violated_categories: [], categories: {} };
        }

        try {
            const url = this.configService.get<string>('HUGGINGFACE_URL', 'https://router.huggingface.co/v1/chat/completions');
            const modelName = this.configService.get<string>('HUGGINGFACE_MODEL', 'Qwen/Qwen2.5-72B-Instruct');
            const prompt = this.configService.get<string>('HUGGINGFACE_PROMPT', 'Bạn là hệ thống kiểm duyệt nội dung mạng xã hội tiếng Việt. Đánh giá xem câu sau có vi phạm tiêu chuẩn cộng đồng không. Các loại vi phạm: Tục tĩu chửi bậy (PROFANITY), Xúc phạm/Lăng mạ (INSULT), Đe dọa bạo lực (THREAT), Kích động thù hận/Phân biệt (HATE_SPEECH), Khiêu dâm (SEXUAL). Chú ý nhận diện các từ lóng, teencode thô tục tiếng Việt (ví dụ: "cc", "dcm", "đcm", "vl", "cl", "djt", "đjt", "Iồn"). Quan trọng: Câu bình thường phải an toàn (SAFE). Chỉ bắt lỗi khi có ý đồ. Trả lời bằng định dạng JSON thuần túy (không dùng markdown code blocks, KHÔNG thêm chữ nào bên ngoài): {"is_safe": boolean, "violated_categories": ["CATEGORY_NAME"]}');

            const payload = {
                model: modelName,
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: `Câu cần kiểm tra: "${text.trim()}"` }
                ],
                max_tokens: 100,
                temperature: 0.1
            };

            const response = await this.httpService.axiosRef.post(
                url,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.hfToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                }
            );

            const answer = response.data.choices[0].message.content;

            // Parse JSON từ câu trả lời của AI
            const cleanJsonStr = answer.replace(/[\u0000-\u001F]+/g, " ")
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            const parsedJson = JSON.parse(cleanJsonStr);

            const is_safe = parsedJson.is_safe ?? true;
            const violated_categories = parsedJson.violated_categories || [];

            // Map kết quả sang đúng interface cũ để không phá vỡ Backend logic
            // const violatedCategoryList = Array.isArray(violated_categories_raw) ? violated_categories_raw : [];
            // const violated_categories = violatedCategoryList.map(cat => ({
            //     category: cat,
            //     category_vi: cat,
            //     confidence: 0.99
            // }));

            this.logger.log(`Kiểm duyệt văn bản: is_safe=${is_safe}, categories=${violated_categories}`);

            return {
                is_safe: is_safe,
                violated_categories: violated_categories,
                categories: {}
            };

        } catch (error) {
            this.logger.error(`Lỗi khi kiểm tra văn bản qua HuggingFace: ${error.message}`);
            if (error.response?.data) {
                this.logger.error(`Chi tiết lỗi API: ${JSON.stringify(error.response.data)}`);
            }

            return { is_safe: true, violated_categories: [], categories: {} };
        }
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly hfToken: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.hfToken = this.configService.get<string>('HUGGINGFACE_ACCESS_TOKEN', '');
    }

    async summarizeMessages(messagesText: string, lang?: string): Promise<string> {
        if (!messagesText || messagesText.trim().length === 0) {
            return lang?.startsWith('vi') ? 'Không có nội dung tin nhắn để tóm tắt.' : 'No message content to summarize.';
        }

        if (!this.hfToken) {
            return lang?.startsWith('vi') ? 'Không thể tóm tắt do chưa cấu hình Hugging Face Token.' : 'Cannot summarize as Hugging Face Token is not configured.';
        }

        try {
            const url = this.configService.get<string>('HUGGINGFACE_URL', '');
            const modelName = this.configService.get<string>('HUGGINGFACE_MODEL', '');

            const isVi = lang ? lang.startsWith('vi') : true;
            const targetLanguageName = isVi ? 'Tiếng Việt' : 'English';

            const systemPrompt = `You are a smart AI assistant integrated in a messaging app. Your task is to read the unread messages from other users and provide a concise summary (bullet points), highlighting core contents and any action items.
Rules:
- Write the summary strictly in ${targetLanguageName}.
- Keep it concise (2-4 bullet points, maximum 150 words).
- Focus on the main details: Who said what, appointments, questions, or key requests.
- Return only the summary itself, without any introductory or concluding conversational filler.`;

            const payload = {
                model: modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: isVi ? `Các tin nhắn chưa đọc cần tóm tắt:\n${messagesText}` : `Unread messages to summarize:\n${messagesText}` }
                ],
                max_tokens: 300,
                temperature: 0.3
            };

            const response = await this.httpService.axiosRef.post(
                url,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.hfToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 25000
                }
            );

            const summary = response.data?.choices?.[0]?.message?.content;
            if (!summary) {
                throw new Error('Không nhận được nội dung từ AI API.');
            }

            return summary.trim();
        } catch (error) {
            this.logger.error(`Lỗi khi tóm tắt tin nhắn qua HuggingFace: ${error.message}`);
            if (error.response?.data) {
                this.logger.error(`Chi tiết lỗi API: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
}

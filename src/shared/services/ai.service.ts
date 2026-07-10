import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSummarizeMessagesPrompt, getActivitySummaryPrompt } from '../../common/prompts';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly geminiApiKey: string;
    private readonly geminiModel: string;

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY', '');
        this.geminiModel = this.configService.get<string>('GEMINI_MODEL', 'gemini-2.0-flash');
    }

    private async generateWithRetry(
        model: any,
        prompt: string
    ) {
        const retries = 3;
        for (let i = 0; i < retries; i++) {
            try {
                return await model.generateContent(prompt);
            } catch (error: any) {
                const status =
                    error.status ||
                    error?.response?.status;
                if (status === 429 || status === 503) {
                    const delay =
                        3000 * (i + 1);
                    this.logger.warn(
                        `Gemini busy. Retry ${i + 1} after ${delay}ms`
                    );
                    await new Promise(
                        r => setTimeout(r, delay)
                    );
                    continue;
                }
                throw error;
            }
        }
        throw new Error(
            'Gemini unavailable'
        );
    }

    async summarizeMessages(messagesText: string, lang?: string): Promise<string> {
        if (!messagesText || messagesText.trim().length === 0) {
            return lang?.startsWith('vi') ? 'Không có nội dung tin nhắn để tóm tắt.' : 'No message content to summarize.';
        }

        if (!this.geminiApiKey) {
            return lang?.startsWith('vi') ? 'Không thể tóm tắt do chưa cấu hình Gemini API Key.' : 'Cannot summarize as Gemini API Key is not configured.';
        }

        try {
            const isVi = lang ? lang.startsWith('vi') : true;
            const targetLanguageName = isVi ? 'Tiếng Việt' : 'English';

            const systemPrompt = getSummarizeMessagesPrompt(targetLanguageName);
            const userMessage = isVi
                ? `Các tin nhắn chưa đọc cần tóm tắt:\n${messagesText}`
                : `Unread messages to summarize:\n${messagesText}`;

            const genAI = new GoogleGenerativeAI(this.geminiApiKey);
            const model = genAI.getGenerativeModel({
                model: this.geminiModel,
                systemInstruction: systemPrompt,
            });

            const result = await this.generateWithRetry(
                model,
                userMessage
            );
            const summary = result.response.text();

            if (!summary) {
                throw new Error('Không nhận được nội dung từ Gemini API.');
            }

            return summary.trim();
        } catch (error) {
            this.logger.error(`Lỗi khi tóm tắt tin nhắn qua Gemini: ${error.message}`);

            const isVi = lang ? lang.startsWith('vi') : true;
            const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests');
            const isOverloaded = error.status === 503 || error.message?.includes('503') || error.message?.includes('Service Unavailable');

            if (isRateLimit || isOverloaded) {
                throw new HttpException(
                    isVi ? 'Hệ thống AI đang quá tải. Vui lòng thử lại sau ít phút.' : 'AI system is overloaded. Please try again in a few minutes.',
                    isRateLimit ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.SERVICE_UNAVAILABLE
                );
            }

            throw new HttpException(
                isVi ? 'Lỗi khi xử lý tóm tắt bằng AI.' : 'Error processing AI summary.',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
    async summarizeUserActivities(activityData: string, targetUserName: string, lang?: string): Promise<string> {
        if (!this.geminiApiKey) {
            return lang?.startsWith('vi') ? 'Không thể tóm tắt do chưa cấu hình Gemini API Key.' : 'Cannot summarize as Gemini API Key is not configured.';
        }

        try {
            const isVi = lang ? lang.startsWith('vi') : true;

            const prompts = getActivitySummaryPrompt(targetUserName);
            const selectedPrompts = isVi ? prompts.vi : prompts.en;
            const systemPrompt = selectedPrompts.system;
            const userMessage = `${selectedPrompts.userPrefix}${activityData}`;

            const genAI = new GoogleGenerativeAI(this.geminiApiKey);
            const model = genAI.getGenerativeModel({
                model: this.geminiModel,
                systemInstruction: systemPrompt,
            });

            console.log("===systemPrompt: ", systemPrompt);
            console.log("===userMessage: ", userMessage);

            const result = await this.generateWithRetry(model, userMessage);
            const summary = result.response.text();

            if (!summary) {
                throw new Error('Không nhận được nội dung từ Gemini API.');
            }

            return summary.trim();
        } catch (error) {
            this.logger.error(`Lỗi khi tóm tắt hoạt động qua Gemini: ${error.message}`);

            const isVi = lang ? lang.startsWith('vi') : true;
            const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests');
            const isOverloaded = error.status === 503 || error.message?.includes('503') || error.message?.includes('Service Unavailable');

            if (isRateLimit || isOverloaded) {
                throw new HttpException(
                    isVi ? 'Hệ thống AI đang quá tải. Vui lòng thử lại sau ít phút.' : 'AI system is overloaded. Please try again in a few minutes.',
                    isRateLimit ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.SERVICE_UNAVAILABLE
                );
            }

            throw new HttpException(
                isVi ? 'Lỗi khi xử lý tóm tắt hoạt động bằng AI.' : 'Error processing AI summary for activities.',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}

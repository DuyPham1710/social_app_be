import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class VoiceEffectService {
    private readonly aiServiceUrl: string;

    // Mapping tên hiển thị (FE) -> preset key
    private readonly presetMapping: Record<string, string> = {
        'Gốc': 'goc',
        'Con gái': 'con_gai',
        'Trầm': 'tram',
        'Em bé': 'em_be',
        'Người ngoài hành tinh': 'nguoi_ngoai_hanh_tinh',
        'Robot': 'robot',
        'Ác quỷ': 'ac_quy',
    };

    constructor(private readonly configService: ConfigService) {
        this.aiServiceUrl =
            this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000';
    }

    /**
     * Chuyển đổi giọng nói bằng AI Service Hub
     * @param audioBuffer Buffer file audio
     * @param originalname Tên file gốc
     * @param voicePreset Tên preset giọng (tiếng Việt từ FE)
     * @returns Buffer audio đã chuyển giọng
     */
    async convertVoice(
        audioBuffer: Buffer,
        originalname: string,
        voicePreset: string,
    ): Promise<Buffer> {
        // Map tên tiếng Việt → preset key
        const presetKey = this.presetMapping[voicePreset] || voicePreset;
        // Nếu là "Gốc" thì trả về audio gốc
        if (presetKey === 'goc') {
            return audioBuffer;
        }

        try {
            const formData = new FormData();
            formData.append('audio', audioBuffer, {
                filename: originalname || 'audio.m4a',
                contentType: 'audio/mp4',
            });
            formData.append('voice_preset', presetKey);

            const response = await axios.post(
                `${this.aiServiceUrl}/voice-conversion/convert`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 phút timeout (CPU có thể chậm)
                },
            );

            return Buffer.from(response.data);
        } catch (error) {
            if (error.response) {
                const statusCode = error.response.status;
                let message = 'Voice conversion failed';

                try {
                    const errorData = JSON.parse(
                        Buffer.from(error.response.data).toString(),
                    );
                    message = errorData.detail || message;
                } catch {
                    // Response không phải JSON
                }

                throw new HttpException(message, statusCode);
            }

            throw new HttpException(
                `AI Service không khả dụng: ${error.message}`,
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    // Lấy danh sách preset có sẵn từ AI Service
    async getPresets(): Promise<any> {
        try {
            const response = await axios.get(
                `${this.aiServiceUrl}/voice-conversion/presets`,
                { timeout: 10000 },
            );
            return response.data;
        } catch (error) {
            throw new HttpException(
                'Không thể lấy danh sách preset giọng nói',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }
}

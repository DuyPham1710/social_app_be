import { v2 as cloudinary } from 'cloudinary';

/**
 * Tải audio từ URL và upload lên Cloudinary
 * @param audioUrl URL của audio cần tải
 * @param storyId ID của story để tạo folder
 * @returns URL của audio trên Cloudinary
 */
export async function uploadAudioFromUrl(
    audioUrl: string,
    storyId: string,
): Promise<string> {
    try {
        // Tải audio từ URL
        const response = await fetch(audioUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
        }

        // Chuyển đổi response thành buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload lên Cloudinary
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `story/${storyId}`,
                    resource_type: 'video', // Cloudinary xử lý audio như video
                    allowed_formats: ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'mp4'],
                    format: 'mp3', // Chuyển đổi về mp3 nếu cần
                    use_filename: true,
                    unique_filename: true,
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result!.secure_url);
                },
            );

            // Pipe buffer vào upload stream
            uploadStream.end(buffer);
        });
    } catch (error) {
        throw new Error(`Failed to upload audio to Cloudinary: ${error.message}`);
    }
}


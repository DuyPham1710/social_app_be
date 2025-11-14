import { CloudinaryStorage } from "multer-storage-cloudinary";
import { v2 as cloudinary } from 'cloudinary';

export const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // Kiểm tra loại file
        const isVideo = file.mimetype?.startsWith('video/');
        const isImage = file.mimetype?.startsWith('image/');

        // Định dạng cho phép
        const allowedFormats = ['jpg', 'png', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv'];

        if (isVideo) {
            // Cấu hình cho video - không áp dụng transformation crop
            return {
                folder: 'uploads',
                allowed_formats: allowedFormats,
                resource_type: 'video',
                // Video có thể có transformation nhưng không nên crop
                transformation: [
                    {
                        width: 1920,
                        height: 1080,
                        crop: 'limit',
                        quality: 'auto',
                        fetch_format: 'auto'
                    }
                ],
            };
        } else if (isImage) {
            // Cấu hình cho hình ảnh
            return {
                folder: 'uploads',
                allowed_formats: allowedFormats,
                resource_type: 'image',
                transformation: [{ width: 500, height: 500, crop: 'limit' }],
            };
        } else {
            // Mặc định - tự động phát hiện
            return {
                folder: 'uploads',
                allowed_formats: allowedFormats,
                resource_type: 'auto',
            };
        }
    },
});
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { v2 as cloudinary } from 'cloudinary';

export const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async () => {
        return {
            folder: 'uploads',
            allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
            transformation: [{ width: 500, height: 500, crop: 'limit' }],
        };
    },
});
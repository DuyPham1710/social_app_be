import { v2 as cloudinary } from 'cloudinary';
import { AttachmentType } from 'src/shared/enums/Attachment_type';
import { File } from 'multer';

export interface UploadedAttachment {
    url: string;
    type: AttachmentType;
    size: number;
}

// Upload file từ Multer (Express.Multer.File) lên Cloudinary
export async function uploadChatAttachmentFromFile(
    file: File,
    conversationId: string,
): Promise<UploadedAttachment> {
    const mimetype = file.mimetype;
    const filename = file.originalname;

    // Phân biệt hình ảnh và video
    const isVideo = mimetype?.startsWith('video/');
    const isImage = mimetype?.startsWith('image/');

    // Định dạng cho phép
    const allowedFormats = [
        'jpg',
        'png',
        'jpeg',
        'gif',
        'webp',
        'mp4',
        'mov',
        'avi',
        'webm',
        'mkv',
        'flv',
        'wmv',
    ];

    // Cấu hình upload dựa trên loại file
    const uploadOptions: any = {
        folder: `chat/${conversationId}`,
        allowed_formats: allowedFormats,
    };

    if (isVideo) {
        // Cấu hình cho video
        uploadOptions.resource_type = 'video';
        uploadOptions.transformation = [
            {
                width: 1920,
                height: 1080,
                crop: 'limit',
                quality: 'auto',
                fetch_format: 'auto',
            },
        ];
    } else if (isImage) {
        // Cấu hình cho hình ảnh
        uploadOptions.resource_type = 'image';
        uploadOptions.transformation = [
            { width: 1080, height: 1080, crop: 'limit' },
        ];
    } else {
        // Tự động phát hiện loại file
        uploadOptions.resource_type = 'auto';
    }

    // Upload từ buffer của Multer
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                // Xác định type dựa trên resource_type từ Cloudinary
                let attachmentType: AttachmentType;
                if (result?.resource_type === 'video') {
                    attachmentType = AttachmentType.VIDEO;
                } else if (result?.resource_type === 'image') {
                    attachmentType = AttachmentType.IMAGE;
                } else if (result?.resource_type === 'raw') {
                    attachmentType = AttachmentType.FILE;
                } else {
                    attachmentType = AttachmentType.FILE;
                }

                resolve({
                    url: result!.secure_url,
                    type: attachmentType,
                    size: result!.bytes,
                });
            },
        );

        // Pipe file buffer vào upload stream
        uploadStream.end(file.buffer);
    });
}

// Upload nhiều files từ Multer lên Cloudinary
export async function uploadChatAttachmentsFromFiles(
    files: File[],
    conversationId: string,
): Promise<UploadedAttachment[]> {
    const uploadPromises = files.map((file) =>
        uploadChatAttachmentFromFile(file, conversationId),
    );
    return Promise.all(uploadPromises);
}

import { PostCategory } from '../enums/post-category.enum';

export const POST_CATEGORIES: PostCategory[] = Object.values(PostCategory);

export const POST_CATEGORY_LABELS_VI: Record<PostCategory, string> = {
    [PostCategory.STUDY]: 'Học tập',
    [PostCategory.TRAVEL]: 'Du lịch',
    [PostCategory.CLASS_REUNION]: 'Họp lớp',
    [PostCategory.SHOPPING]: 'Mua sắm',
    [PostCategory.FOOD]: 'Ẩm thực',
    [PostCategory.SPORTS]: 'Thể thao',
    [PostCategory.MUSIC]: 'Âm nhạc',
    [PostCategory.MOVIE]: 'Phim ảnh',
    [PostCategory.GAMING]: 'Gaming',
    [PostCategory.TECHNOLOGY]: 'Công nghệ',
    [PostCategory.WORK]: 'Công việc',
    [PostCategory.FAMILY]: 'Gia đình',
    [PostCategory.FRIENDS]: 'Bạn bè',
    [PostCategory.LOVE]: 'Tình yêu',
    [PostCategory.HEALTH]: 'Sức khỏe',
    [PostCategory.FASHION]: 'Thời trang',
    [PostCategory.PET]: 'Thú cưng',
    [PostCategory.NEWS]: 'Tin tức',
    [PostCategory.EVENT]: 'Sự kiện',
    [PostCategory.FUNNY]: 'Hài hước',
    [PostCategory.LIFE]: 'Đời sống',
    [PostCategory.OTHER]: 'Khác',
};

import { Injectable } from '@nestjs/common';
import { PostCategory } from 'src/common/enums/post-category.enum';

export interface RuleBasedCategoryResult {
  category: PostCategory | null;
  confidence: number;
  matchedKeywords: string[];
}

interface KeywordGroup {
  category: PostCategory;
  keywords: string[];
}

interface CategoryScore {
  category: PostCategory;
  score: number;
  matchedKeywords: string[];
}

@Injectable()
export class RuleBasedPostCategoryService {
  private readonly keywordGroups: KeywordGroup[] = [
    {
      category: PostCategory.STUDY,
      keywords: [
        'học',
        'học tập',
        'bài tập',
        'đồ án',
        'thi',
        'kiểm tra',
        'môn học',
        'deadline môn',
        'sinh viên',
        'trường',
        'đại học',
      ],
    },
    {
      category: PostCategory.TRAVEL,
      keywords: [
        'du lịch',
        'đi chơi',
        'check in',
        'check-in',
        'đà lạt',
        'vũng tàu',
        'nha trang',
        'phú quốc',
        'hà nội',
        'sài gòn',
        'đà nẵng',
        'hội an',
        'resort',
        'khách sạn',
      ],
    },
    {
      category: PostCategory.CLASS_REUNION,
      keywords: [
        'họp lớp',
        'bạn cũ',
        'lớp cũ',
        'kỷ niệm lớp',
        'gặp lại bạn học',
        'reunion',
      ],
    },
    {
      category: PostCategory.SHOPPING,
      keywords: [
        'mua',
        'mua sắm',
        'sale',
        'giảm giá',
        'đặt hàng',
        'order',
        'săn sale',
        'sản phẩm',
        'shop',
      ],
    },
    {
      category: PostCategory.FOOD,
      keywords: [
        'ăn',
        'món ăn',
        'quán ăn',
        'nhà hàng',
        'trà sữa',
        'cà phê',
        'cafe',
        'bánh',
        'bún',
        'phở',
        'cơm',
        'đồ ăn',
      ],
    },
    {
      category: PostCategory.SPORTS,
      keywords: [
        'bóng đá',
        'thể thao',
        'gym',
        'chạy bộ',
        'đá banh',
        'cầu lông',
        'bóng chuyền',
        'tập luyện',
      ],
    },
    {
      category: PostCategory.MUSIC,
      keywords: ['nhạc', 'bài hát', 'ca sĩ', 'concert', 'karaoke', 'album'],
    },
    {
      category: PostCategory.MOVIE,
      keywords: ['phim', 'rạp phim', 'xem phim', 'review phim', 'cinema'],
    },
    {
      category: PostCategory.GAMING,
      keywords: [
        'game',
        'gaming',
        'rank',
        'combat',
        'livestream game',
        'liên quân',
        'free fire',
        'pubg',
        'valorant',
        'lol',
        'liên minh',
      ],
    },
    {
      category: PostCategory.TECHNOLOGY,
      keywords: [
        'công nghệ',
        'lập trình',
        'code',
        'flutter',
        'react',
        'nestjs',
        'mongodb',
        'điện thoại',
        'laptop',
        'máy tính',
        'ai',
        'phần mềm',
      ],
    },
    {
      category: PostCategory.WORK,
      keywords: [
        'công việc',
        'công ty',
        'đi làm',
        'deadline',
        'dự án',
        'họp',
        'meeting',
        'task',
        'sếp',
        'đồng nghiệp',
      ],
    },
    {
      category: PostCategory.FAMILY,
      keywords: [
        'gia đình',
        'bố',
        'mẹ',
        'ba',
        'má',
        'cha',
        'anh trai',
        'chị gái',
        'em gái',
        'em trai',
        'ông bà',
      ],
    },
    {
      category: PostCategory.FRIENDS,
      keywords: ['bạn bè', 'bạn thân', 'tụi bạn', 'hội bạn', 'đi chơi với bạn'],
    },
    {
      category: PostCategory.LOVE,
      keywords: [
        'người yêu',
        'crush',
        'yêu',
        'tình yêu',
        'hẹn hò',
        'bạn gái',
        'bạn trai',
      ],
    },
    {
      category: PostCategory.HEALTH,
      keywords: [
        'sức khỏe',
        'bệnh',
        'đau',
        'khám bệnh',
        'bác sĩ',
        'dinh dưỡng',
        'giảm cân',
        'tăng cân',
        'tập thể dục',
      ],
    },
    {
      category: PostCategory.FASHION,
      keywords: [
        'thời trang',
        'outfit',
        'quần áo',
        'áo',
        'váy',
        'giày',
        'phối đồ',
        'style',
      ],
    },
    {
      category: PostCategory.PET,
      keywords: ['chó', 'mèo', 'thú cưng', 'pet', 'cún', 'boss', 'sen'],
    },
    {
      category: PostCategory.NEWS,
      keywords: [
        'tin tức',
        'thời sự',
        'xã hội',
        'cập nhật',
        'thông báo',
        'breaking news',
      ],
    },
    {
      category: PostCategory.EVENT,
      keywords: [
        'sự kiện',
        'sinh nhật',
        'tiệc',
        'party',
        'lễ hội',
        'khai trương',
        'đám cưới',
      ],
    },
    {
      category: PostCategory.FUNNY,
      keywords: ['hài', 'hài hước', 'meme', 'cười', 'vui', 'vui vẻ', 'troll'],
    },
    {
      category: PostCategory.LIFE,
      keywords: [
        'cuộc sống',
        'hôm nay',
        'tâm trạng',
        'buồn',
        'vui',
        'mệt',
        'chill',
        'một ngày',
        'đời sống',
      ],
    },
  ];

  classify(caption: string): RuleBasedCategoryResult {
    const normalizedCaption = this.normalize(caption);

    if (!normalizedCaption) {
      return { category: null, confidence: 0, matchedKeywords: [] };
    }

    const scoredCategories = this.keywordGroups
      .map((group) => this.scoreCategory(group, normalizedCaption))
      .filter((result) => result.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.matchedKeywords.length - a.matchedKeywords.length,
      );

    const winner = scoredCategories[0];
    if (!winner) {
      return { category: null, confidence: 0, matchedKeywords: [] };
    }

    return {
      category: winner.category,
      confidence: this.calculateConfidence(winner, scoredCategories[1]),
      matchedKeywords: winner.matchedKeywords,
    };
  }

  private normalize(text: string): string {
    return text
      .toLocaleLowerCase('vi-VN')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private scoreCategory(
    group: KeywordGroup,
    normalizedCaption: string,
  ): CategoryScore {
    const matchedKeywords = group.keywords
      .map((keyword) => this.normalize(keyword))
      .filter((keyword) => normalizedCaption.includes(keyword));

    const score = matchedKeywords.reduce(
      (total, keyword) => total + this.getKeywordWeight(keyword),
      0,
    );

    return {
      category: group.category,
      score,
      matchedKeywords,
    };
  }

  private getKeywordWeight(keyword: string): number {
    const wordCount = keyword.split(' ').length;

    if (wordCount >= 3) {
      return 3;
    }

    if (wordCount === 2 || keyword.includes('-')) {
      return 2;
    }

    return 1;
  }

  private calculateConfidence(
    winner: CategoryScore,
    runnerUp?: CategoryScore,
  ): number {
    const baseConfidence = Math.min(
      0.95,
      0.45 + winner.score * 0.12 + winner.matchedKeywords.length * 0.08,
    );
    if (!runnerUp) {
      return Number(baseConfidence.toFixed(2));
    }

    const margin = winner.score - runnerUp.score;
    const marginBoost = Math.max(0, Math.min(0.08, margin * 0.03));

    return Number(Math.min(0.95, baseConfidence + marginBoost).toFixed(2));
  }
}

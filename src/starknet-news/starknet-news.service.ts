import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Like,
  FindOptionsWhere,
  MoreThanOrEqual,
  LessThanOrEqual,
  In,
  IsNull,
  Not,
} from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StarknetNews } from './entities/news.entity';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { QueryNewsDto } from './dto/query-news.dto';

@Injectable()
export class StarknetNewsService {
  private readonly logger = new Logger(StarknetNewsService.name);
  constructor(
    @InjectRepository(StarknetNews)
    private readonly newsRepository: Repository<StarknetNews>,
  ) {}

  async create(createNewsDto: CreateNewsDto): Promise<StarknetNews> {
    try {
      // Validate content
      const validationErrors = this.validateContent(createNewsDto);
      if (validationErrors.length > 0) {
        throw new BadRequestException(validationErrors);
      }

      // Sanitize content
      if (createNewsDto.content) {
        createNewsDto.content = this.sanitizeContent(createNewsDto.content);
      }
      if (createNewsDto.summary) {
        createNewsDto.summary = this.sanitizeContent(createNewsDto.summary);
      }
      if (createNewsDto.excerpt) {
        createNewsDto.excerpt = this.sanitizeContent(createNewsDto.excerpt);
      }

      // Auto-generate slug if not provided
      if (!createNewsDto.slug && createNewsDto.title) {
        let baseSlug = this.generateSlug(createNewsDto.title);
        let slug = baseSlug;
        let counter = 1;

        // Ensure slug uniqueness
        while (await this.newsRepository.findOne({ where: { slug } })) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        createNewsDto.slug = slug;
      }

      // Calculate reading time if not provided
      if (!createNewsDto.readingTimeMinutes && createNewsDto.content) {
        createNewsDto.readingTimeMinutes = this.calculateReadingTime(
          createNewsDto.content,
        );
      }

      const news = this.newsRepository.create({
        ...createNewsDto,
        publishedAt: createNewsDto.isPublished ? new Date() : null,
      });

      const savedNews = await this.newsRepository.save(news);
      this.logger.log(
        `Created news article: ${savedNews.id} - ${savedNews.title}`,
      );

      return savedNews;
    } catch (error) {
      this.logger.error(
        `Failed to create news article: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create news article');
    }
  }

  async findAll(queryDto: QueryNewsDto): Promise<{
    data: StarknetNews[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  }> {
    try {
      const {
        page = 1,
        limit = 10,
        category,
        isPublished,
        isFeatured,
        tags,
        priority,
        author,
        search,
        publishedAfter,
        publishedBefore,
        scheduledAfter,
        scheduledBefore,
        minViews,
        minLikes,
        sortBy = 'publishedAt',
        sortOrder = 'DESC',
        includeDeleted = false,
      } = queryDto;

      const queryBuilder = this.newsRepository.createQueryBuilder('news');

      // Soft delete handling
      if (!includeDeleted) {
        queryBuilder.where('news.deletedAt IS NULL');
      }

      // Apply filters
      if (category !== undefined) {
        queryBuilder.andWhere('news.category = :category', { category });
      }

      if (isPublished !== undefined) {
        queryBuilder.andWhere('news.isPublished = :isPublished', {
          isPublished,
        });
      }

      if (isFeatured !== undefined) {
        queryBuilder.andWhere('news.isFeatured = :isFeatured', { isFeatured });
      }

      if (priority !== undefined) {
        queryBuilder.andWhere('news.priority = :priority', { priority });
      }

      if (author !== undefined) {
        queryBuilder.andWhere('news.author ILIKE :author', {
          author: `%${author}%`,
        });
      }

      if (tags && tags.length > 0) {
        queryBuilder.andWhere('news.tags && :tags', { tags });
      }

      // Date range filters
      if (publishedAfter) {
        queryBuilder.andWhere('news.publishedAt >= :publishedAfter', {
          publishedAfter,
        });
      }

      if (publishedBefore) {
        queryBuilder.andWhere('news.publishedAt <= :publishedBefore', {
          publishedBefore,
        });
      }

      if (scheduledAfter) {
        queryBuilder.andWhere('news.scheduledFor >= :scheduledAfter', {
          scheduledAfter,
        });
      }

      if (scheduledBefore) {
        queryBuilder.andWhere('news.scheduledFor <= :scheduledBefore', {
          scheduledBefore,
        });
      }

      // Engagement filters
      if (minViews !== undefined) {
        queryBuilder.andWhere('news.viewCount >= :minViews', { minViews });
      }

      if (minLikes !== undefined) {
        queryBuilder.andWhere('news.likeCount >= :minLikes', { minLikes });
      }

      // Full-text search
      if (search) {
        queryBuilder.andWhere(
          "(news.title ILIKE :search OR news.content ILIKE :search OR news.summary ILIKE :search OR news.excerpt ILIKE :search OR array_to_string(news.tags, ',') ILIKE :search)",
          { search: `%${search}%` },
        );
      }

      // Apply sorting with enhanced options
      const validSortFields = [
        'publishedAt',
        'createdAt',
        'updatedAt',
        'title',
        'category',
        'priority',
        'viewCount',
        'likeCount',
        'shareCount',
      ];
      const sortField = validSortFields.includes(sortBy)
        ? sortBy
        : 'publishedAt';

      // Handle priority sorting specially
      if (sortField === 'priority') {
        const priorityOrder = { urgent: 1, high: 2, normal: 3, low: 4 };
        queryBuilder.addSelect(
          `CASE news.priority ${Object.entries(priorityOrder)
            .map(([priority, order]) => `WHEN '${priority}' THEN ${order}`)
            .join(' ')} END`,
          'priority_order',
        );
        queryBuilder.orderBy('priority_order', sortOrder);
      } else {
        queryBuilder.orderBy(`news.${sortField}`, sortOrder);
      }

      // Defensive re-validation in case findAll() is invoked directly with an unvalidated query object
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));

      // Apply pagination
      const skip = (safePage - 1) * safeLimit;
      queryBuilder.skip(skip).take(safeLimit);

      const [data, total] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(total / safeLimit);

      this.logger.log(
        `Retrieved ${data.length} news articles (page ${safePage}/${totalPages})`,
      );

      return {
        data,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrevious: safePage > 1,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve news articles: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to retrieve news articles');
    }
  }

  async findOne(id: string): Promise<StarknetNews> {
    const news = await this.newsRepository.findOne({
      where: { id },
    });

    if (!news) {
      throw new NotFoundException(`News article with ID ${id} not found`);
    }

    return news;
  }

  async findPublished(): Promise<StarknetNews[]> {
    return await this.newsRepository.find({
      where: { isPublished: true },
      order: { publishedAt: 'DESC' },
    });
  }

  async findByCategory(category: string): Promise<StarknetNews[]> {
    return await this.newsRepository.find({
      where: { category, isPublished: true },
      order: { publishedAt: 'DESC' },
    });
  }

  async update(
    id: string,
    updateNewsDto: UpdateNewsDto,
  ): Promise<StarknetNews> {
    const existingNews = await this.findOne(id);

    // Set publishedAt if changing from unpublished to published
    const updatedData: Partial<StarknetNews> = { ...updateNewsDto };
    if (updateNewsDto.isPublished === true && !existingNews.isPublished) {
      updatedData.publishedAt = new Date();
    } else if (updateNewsDto.isPublished === false) {
      updatedData.publishedAt = null;
    }

    const news = await this.newsRepository.preload({
      id,
      ...updatedData,
    });

    if (!news) {
      throw new NotFoundException(`News article with ID ${id} not found`);
    }

    return await this.newsRepository.save(news);
  }

  async remove(id: string): Promise<void> {
    const news = await this.findOne(id);
    await this.newsRepository.remove(news);
  }

  async getCategories(): Promise<string[]> {
    const result = await this.newsRepository
      .createQueryBuilder('news')
      .select('DISTINCT news.category', 'category')
      .where('news.isPublished = :isPublished AND news.deletedAt IS NULL', {
        isPublished: true,
      })
      .getRawMany();

    return result.map((item) => item.category);
  }

  // Engagement tracking methods
  async incrementViewCount(id: string): Promise<void> {
    try {
      await this.newsRepository.increment({ id }, 'viewCount', 1);
      this.logger.log(`Incremented view count for news article: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to increment view count for ${id}: ${error.message}`,
      );
    }
  }

  async incrementShareCount(id: string): Promise<void> {
    try {
      await this.newsRepository.increment({ id }, 'shareCount', 1);
      this.logger.log(`Incremented share count for news article: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to increment share count for ${id}: ${error.message}`,
      );
    }
  }

  async incrementLikeCount(id: string): Promise<void> {
    try {
      await this.newsRepository.increment({ id }, 'likeCount', 1);
      this.logger.log(`Incremented like count for news article: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to increment like count for ${id}: ${error.message}`,
      );
    }
  }

  async decrementLikeCount(id: string): Promise<void> {
    try {
      await this.newsRepository.decrement({ id }, 'likeCount', 1);
      this.logger.log(`Decremented like count for news article: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to decrement like count for ${id}: ${error.message}`,
      );
    }
  }

  // Analytics and statistics methods
  async getNewsStatistics(): Promise<{
    totalNews: number;
    publishedNews: number;
    draftNews: number;
    scheduledNews: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    categoriesCount: number;
    tagsCount: number;
  }> {
    const stats = await this.newsRepository
      .createQueryBuilder('news')
      .select([
        'COUNT(*) as totalNews',
        'COUNT(CASE WHEN news.isPublished = true THEN 1 END) as publishedNews',
        'COUNT(CASE WHEN news.isPublished = false THEN 1 END) as draftNews',
        'COUNT(CASE WHEN news.scheduledFor > NOW() THEN 1 END) as scheduledNews',
        'SUM(news.viewCount) as totalViews',
        'SUM(news.likeCount) as totalLikes',
        'SUM(news.shareCount) as totalShares',
        'COUNT(DISTINCT news.category) as categoriesCount',
      ])
      .where('news.deletedAt IS NULL')
      .getRawOne();

    const tagsResult = await this.newsRepository
      .createQueryBuilder('news')
      .select('COUNT(DISTINCT tag) as tagsCount')
      .from('unnest(news.tags)', 'tag')
      .where('news.deletedAt IS NULL AND news.tags IS NOT NULL')
      .getRawOne();

    return {
      ...stats,
      tagsCount: tagsResult?.tagsCount || 0,
    };
  }

  async getPopularNews(limit: number = 10): Promise<StarknetNews[]> {
    return await this.newsRepository.find({
      where: { isPublished: true, deletedAt: IsNull() },
      order: { viewCount: 'DESC', likeCount: 'DESC' },
      take: limit,
    });
  }

  async getTrendingNews(
    days: number = 7,
    limit: number = 10,
  ): Promise<StarknetNews[]> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    return await this.newsRepository.find({
      where: {
        isPublished: true,
        publishedAt: MoreThanOrEqual(dateThreshold),
        deletedAt: IsNull(),
      },
      order: { viewCount: 'DESC', likeCount: 'DESC' },
      take: limit,
    });
  }

  async getFeaturedNews(): Promise<StarknetNews[]> {
    return await this.newsRepository.find({
      where: { isPublished: true, isFeatured: true, deletedAt: IsNull() },
      order: { publishedAt: 'DESC' },
    });
  }

  async getNewsByTags(
    tags: string[],
    limit: number = 20,
  ): Promise<StarknetNews[]> {
    return await this.newsRepository
      .createQueryBuilder('news')
      .where('news.isPublished = :isPublished', { isPublished: true })
      .andWhere('news.deletedAt IS NULL')
      .andWhere('news.tags && :tags', { tags })
      .orderBy('news.publishedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAllTags(): Promise<string[]> {
    const result = await this.newsRepository
      .createQueryBuilder('news')
      .select('DISTINCT tag')
      .from('unnest(news.tags)', 'tag')
      .where('news.isPublished = :isPublished AND news.deletedAt IS NULL', {
        isPublished: true,
      })
      .orderBy('tag')
      .getRawMany();

    return result.map((item) => item.tag).filter((tag) => tag && tag.trim());
  }

  // Scheduled publication handling
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledNews(): Promise<void> {
    try {
      const scheduledNews = await this.newsRepository.find({
        where: {
          isPublished: false,
          scheduledFor: LessThanOrEqual(new Date()),
          deletedAt: IsNull(),
        },
      });

      if (scheduledNews.length > 0) {
        for (const news of scheduledNews) {
          news.isPublished = true;
          news.publishedAt = new Date();
          news.scheduledFor = null;
          await this.newsRepository.save(news);
          this.logger.log(
            `Auto-published scheduled news article: ${news.id} - ${news.title}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to publish scheduled news: ${error.message}`,
        error.stack,
      );
    }
  }

  // Utility methods
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private calculateReadingTime(content: string): number {
    const wordsPerMinute = 200;
    const wordCount = content.trim().split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  private sanitizeContent(content: string): string {
    // Basic HTML sanitization - remove script tags and suspicious content
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  private validateContent(dto: any): string[] {
    const errors: string[] = [];

    // Validate title
    if (dto.title && dto.title.length < 10) {
      errors.push('Title must be at least 10 characters long');
    }

    // Validate content length
    if (dto.content && dto.content.length < 100) {
      errors.push('Content must be at least 100 characters long');
    }

    // Validate tags
    if (dto.tags && dto.tags.length > 10) {
      errors.push('Maximum 10 tags allowed');
    }

    // Validate slug uniqueness
    if (dto.slug && !/^[a-z0-9-]+$/.test(dto.slug)) {
      errors.push(
        'Slug must contain only lowercase letters, numbers, and hyphens',
      );
    }

    return errors;
  }

  // Bulk operations
  async bulkUpdate(
    ids: string[],
    updateData: Partial<StarknetNews>,
  ): Promise<void> {
    try {
      await this.newsRepository.update(ids, updateData);
      this.logger.log(`Bulk updated ${ids.length} news articles`);
    } catch (error) {
      this.logger.error(
        `Failed to bulk update news articles: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to bulk update news articles');
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    try {
      await this.newsRepository.softDelete(ids);
      this.logger.log(`Bulk deleted ${ids.length} news articles`);
    } catch (error) {
      this.logger.error(
        `Failed to bulk delete news articles: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to bulk delete news articles');
    }
  }

  // Soft delete implementation
  async softRemove(id: string): Promise<void> {
    const news = await this.findOne(id);
    await this.newsRepository.softRemove(news);
    this.logger.log(`Soft deleted news article: ${id} - ${news.title}`);
  }

  async restore(id: string): Promise<StarknetNews> {
    const news = await this.newsRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!news) {
      throw new NotFoundException(`News article with ID ${id} not found`);
    }

    const restored = await this.newsRepository.recover(news);
    this.logger.log(`Restored news article: ${id} - ${restored.title}`);
    return restored;
  }
}

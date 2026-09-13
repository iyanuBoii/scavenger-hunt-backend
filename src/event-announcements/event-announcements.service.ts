import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
} from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateEventAnnouncementDto } from './dto/create-event-announcement.dto';
import { UpdateEventAnnouncementDto } from './dto/update-event-announcement.dto';
import {
  QueryEventAnnouncementDto,
  BulkAnnouncementActionDto,
} from './dto/query-event-announcement.dto';
import { EventAnnouncement } from './entities/event-announcement.entity';
import {
  AnnouncementType,
  AnnouncementPriority,
  AnnouncementStatus,
} from './enums/announcement.enum';
import { AnnouncementCacheService } from './services/cache.service';
import { AnnouncementAnalyticsService } from './services/analytics.service';
import { AnnouncementNotificationService } from './services/notification.service';
import { AnnouncementsGateway } from './gateways/announcements.gateway';

@Injectable()
export class EventAnnouncementsService {
  private readonly logger = new Logger(EventAnnouncementsService.name);

  constructor(
    @InjectRepository(EventAnnouncement)
    private readonly announcementRepository: Repository<EventAnnouncement>,
    private readonly cacheService: AnnouncementCacheService,
    private readonly analyticsService: AnnouncementAnalyticsService,
    private readonly notificationService: AnnouncementNotificationService,
    private readonly gateway: AnnouncementsGateway,
  ) {}

  async create(
    createDto: CreateEventAnnouncementDto,
  ): Promise<EventAnnouncement> {
    try {
      // Validate and sanitize content
      this.validateAnnouncementContent(createDto);

      // Generate slug if not provided
      if (!createDto.slug) {
        createDto.slug = await this.generateUniqueSlug(createDto.title);
      } else {
        // Validate custom slug
        await this.validateSlug(createDto.slug);
      }

      // Sanitize content for security
      const sanitizedContent = this.sanitizeContent(createDto.content);

      // Calculate reading time
      const readingTimeMinutes = this.calculateReadingTime(sanitizedContent);

      // Set default values
      const announcementData = {
        ...createDto,
        content: sanitizedContent,
        readingTimeMinutes,
        viewCount: 0,
        likeCount: 0,
        shareCount: 0,
        clickCount: 0,
        acknowledgeCount: 0,
        currentParticipants: 0,
        publishedAt: createDto.isPublished ? new Date() : null,
      };

      const announcement = this.announcementRepository.create(announcementData);
      const savedAnnouncement =
        await this.announcementRepository.save(announcement);

      // Invalidate related cache
      this.cacheService.invalidateAnnouncementCache();

      // Send notifications if announcement is published
      if (savedAnnouncement.isPublished) {
        await this.notificationService.notifyUsers({
          type: 'new_announcement',
          announcement: savedAnnouncement,
          priority: this.mapPriorityToNotificationPriority(
            savedAnnouncement.priority,
          ),
          targetAudience: savedAnnouncement.targetAudience,
        });

        // Broadcast via gateway (WebSocket or HTTP)
        await this.gateway.broadcastNewAnnouncement(savedAnnouncement);

        // Send featured notification if applicable
        if (savedAnnouncement.isFeatured) {
          await this.gateway.sendFeaturedNotification(savedAnnouncement);
        }
      }

      this.logger.log(
        `Created announcement: ${savedAnnouncement.id} - ${savedAnnouncement.title}`,
      );
      return savedAnnouncement;
    } catch (error) {
      this.logger.error(
        `Failed to create announcement: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findAll(queryDto: QueryEventAnnouncementDto = {}) {
    try {
      // Generate cache key for this query
      const cacheKey = this.cacheService.generateKey(
        'findAll',
        JSON.stringify(queryDto),
      );

      // Try to get cached result
      const cached = this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const {
        page = 1,
        limit = 10,
        type,
        status,
        priority,
        category,
        isPublished,
        isActive,
        isFeatured,
        isPinned,
        tags,
        author,
        search,
        eventDateAfter,
        eventDateBefore,
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

      const queryBuilder =
        this.announcementRepository.createQueryBuilder('announcement');

      // Apply filters
      if (type) {
        queryBuilder.andWhere('announcement.type = :type', { type });
      }

      if (status) {
        queryBuilder.andWhere('announcement.status = :status', { status });
      }

      if (priority) {
        queryBuilder.andWhere('announcement.priority = :priority', {
          priority,
        });
      }

      if (category) {
        queryBuilder.andWhere('announcement.category = :category', {
          category,
        });
      }

      if (isPublished !== undefined) {
        queryBuilder.andWhere('announcement.isPublished = :isPublished', {
          isPublished,
        });
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere('announcement.isActive = :isActive', {
          isActive,
        });
      }

      if (isFeatured !== undefined) {
        queryBuilder.andWhere('announcement.isFeatured = :isFeatured', {
          isFeatured,
        });
      }

      if (isPinned !== undefined) {
        queryBuilder.andWhere('announcement.isPinned = :isPinned', {
          isPinned,
        });
      }

      if (tags && tags.length > 0) {
        queryBuilder.andWhere('announcement.tags && :tags', { tags });
      }

      if (author) {
        queryBuilder.andWhere('announcement.author ILIKE :author', {
          author: `%${author}%`,
        });
      }

      if (search) {
        queryBuilder.andWhere(
          '(announcement.title ILIKE :search OR announcement.content ILIKE :search OR announcement.summary ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      // Date filters
      if (eventDateAfter) {
        queryBuilder.andWhere('announcement.eventDate >= :eventDateAfter', {
          eventDateAfter,
        });
      }

      if (eventDateBefore) {
        queryBuilder.andWhere('announcement.eventDate <= :eventDateBefore', {
          eventDateBefore,
        });
      }

      if (publishedAfter) {
        queryBuilder.andWhere('announcement.publishedAt >= :publishedAfter', {
          publishedAfter,
        });
      }

      if (publishedBefore) {
        queryBuilder.andWhere('announcement.publishedAt <= :publishedBefore', {
          publishedBefore,
        });
      }

      if (scheduledAfter) {
        queryBuilder.andWhere('announcement.scheduledFor >= :scheduledAfter', {
          scheduledAfter,
        });
      }

      if (scheduledBefore) {
        queryBuilder.andWhere('announcement.scheduledFor <= :scheduledBefore', {
          scheduledBefore,
        });
      }

      // Engagement filters
      if (minViews !== undefined) {
        queryBuilder.andWhere('announcement.viewCount >= :minViews', {
          minViews,
        });
      }

      if (minLikes !== undefined) {
        queryBuilder.andWhere('announcement.likeCount >= :minLikes', {
          minLikes,
        });
      }

      // Handle deleted records
      if (!includeDeleted) {
        queryBuilder.andWhere('announcement.deletedAt IS NULL');
      }

      // Sorting
      const allowedSortFields = [
        'createdAt',
        'updatedAt',
        'publishedAt',
        'eventDate',
        'scheduledFor',
        'title',
        'type',
        'status',
        'priority',
        'category',
        'author',
        'viewCount',
        'likeCount',
        'shareCount',
        'clickCount',
      ];

      if (allowedSortFields.includes(sortBy)) {
        queryBuilder.orderBy(`announcement.${sortBy}`, sortOrder);
      } else {
        queryBuilder.orderBy('announcement.publishedAt', 'DESC');
      }

      // Add secondary sorting
      queryBuilder.addOrderBy('announcement.createdAt', 'DESC');

      // Defensive re-validation in case findAll() is invoked directly with an unvalidated query object
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));

      // Pagination
      const offset = (safePage - 1) * safeLimit;
      queryBuilder.skip(offset).take(safeLimit);

      const [data, total] = await queryBuilder.getManyAndCount();

      const result = {
        data,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNext: safePage * safeLimit < total,
        hasPrevious: safePage > 1,
      };

      // Cache the result
      this.cacheService.set(cacheKey, result, 180); // Cache for 3 minutes

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to find announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findOne(id: string): Promise<EventAnnouncement> {
    try {
      const announcement = await this.announcementRepository.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!announcement) {
        throw new NotFoundException(`Announcement with ID ${id} not found`);
      }

      return announcement;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to find announcement ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findPublished(): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository.find({
        where: {
          isPublished: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { publishedAt: 'DESC', isPinned: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find published announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findByType(type: AnnouncementType): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository.find({
        where: {
          type,
          isPublished: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { publishedAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find announcements by type ${type}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findByCategory(category: string): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository.find({
        where: {
          category,
          isPublished: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { publishedAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find announcements by category ${category}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getFeaturedAnnouncements(): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository.find({
        where: {
          isFeatured: true,
          isPublished: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { priority: 'DESC', publishedAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find featured announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPinnedAnnouncements(): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository.find({
        where: {
          isPinned: true,
          isPublished: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { priority: 'DESC', publishedAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pinned announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPopularAnnouncements(
    limit: number = 10,
  ): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository.find({
        where: {
          isPublished: true,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: {
          viewCount: 'DESC',
          likeCount: 'DESC',
          shareCount: 'DESC',
        },
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to find popular announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getTrendingAnnouncements(
    days: number = 7,
    limit: number = 10,
  ): Promise<EventAnnouncement[]> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      return await this.announcementRepository
        .createQueryBuilder('announcement')
        .where('announcement.publishedAt >= :since', { since })
        .andWhere('announcement.isPublished = true')
        .andWhere('announcement.isActive = true')
        .andWhere('announcement.deletedAt IS NULL')
        .orderBy('announcement.viewCount', 'DESC')
        .addOrderBy('announcement.likeCount', 'DESC')
        .addOrderBy('announcement.shareCount', 'DESC')
        .limit(limit)
        .getMany();
    } catch (error) {
      this.logger.error(
        `Failed to find trending announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAnnouncementsByTags(
    tags: string[],
    limit: number = 20,
  ): Promise<EventAnnouncement[]> {
    try {
      return await this.announcementRepository
        .createQueryBuilder('announcement')
        .where('announcement.tags && :tags', { tags })
        .andWhere('announcement.isPublished = true')
        .andWhere('announcement.isActive = true')
        .andWhere('announcement.deletedAt IS NULL')
        .orderBy('announcement.publishedAt', 'DESC')
        .limit(limit)
        .getMany();
    } catch (error) {
      this.logger.error(
        `Failed to find announcements by tags: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async update(
    id: string,
    updateDto: UpdateEventAnnouncementDto,
  ): Promise<EventAnnouncement> {
    try {
      const announcement = await this.findOne(id);

      // Validate content if being updated
      if (updateDto.content || updateDto.title) {
        this.validateAnnouncementContent({
          title: updateDto.title || announcement.title,
          content: updateDto.content || announcement.content,
        } as any);
      }

      // Handle slug update
      if (updateDto.slug && updateDto.slug !== announcement.slug) {
        await this.validateSlug(updateDto.slug, id);
      }

      // Sanitize content if provided
      if (updateDto.content) {
        updateDto.content = this.sanitizeContent(updateDto.content);
        updateDto.readingTimeMinutes = this.calculateReadingTime(
          updateDto.content,
        );
      }

      // Handle publication status changes
      if (updateDto.isPublished !== undefined) {
        if (updateDto.isPublished && !announcement.isPublished) {
          (updateDto as any).publishedAt = new Date();
        } else if (!updateDto.isPublished && announcement.isPublished) {
          (updateDto as any).publishedAt = null;
        }
      }

      // Update the announcement
      const updatedData = { ...updateDto } as Partial<EventAnnouncement>;
      await this.announcementRepository.update(id, updatedData);

      const updatedAnnouncement = await this.findOne(id);
      this.logger.log(
        `Updated announcement: ${id} - ${updatedAnnouncement.title}`,
      );

      return updatedAnnouncement;
    } catch (error) {
      this.logger.error(
        `Failed to update announcement ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const announcement = await this.findOne(id);
      await this.announcementRepository.remove(announcement);

      this.logger.log(`Permanently deleted announcement: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove announcement ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async softRemove(id: string): Promise<void> {
    try {
      const announcement = await this.findOne(id);
      await this.announcementRepository.softRemove(announcement);

      this.logger.log(`Soft deleted announcement: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to soft remove announcement ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async restore(id: string): Promise<EventAnnouncement> {
    try {
      const announcement = await this.announcementRepository.findOne({
        where: { id },
        withDeleted: true,
      });

      if (!announcement) {
        throw new NotFoundException(`Announcement with ID ${id} not found`);
      }

      await this.announcementRepository.restore(id);
      const restoredAnnouncement = await this.findOne(id);

      this.logger.log(`Restored announcement: ${id}`);
      return restoredAnnouncement;
    } catch (error) {
      this.logger.error(
        `Failed to restore announcement ${id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Engagement tracking methods
  async incrementViewCount(id: string, userId?: string): Promise<void> {
    try {
      await this.announcementRepository.increment({ id }, 'viewCount', 1);

      // Track analytics if userId provided
      if (userId) {
        await this.analyticsService.trackEngagement({
          userId,
          announcementId: id,
          action: 'view',
          timestamp: new Date(),
        });
      }

      // Invalidate cache for this announcement
      this.cacheService.clearByPattern(`announcement:${id}`);
    } catch (error) {
      this.logger.warn(
        `Failed to increment view count for announcement ${id}: ${error.message}`,
      );
    }
  }

  async incrementLikeCount(id: string): Promise<void> {
    try {
      await this.announcementRepository.increment({ id }, 'likeCount', 1);
    } catch (error) {
      this.logger.warn(
        `Failed to increment like count for announcement ${id}: ${error.message}`,
      );
    }
  }

  async decrementLikeCount(id: string): Promise<void> {
    try {
      const announcement = await this.announcementRepository.findOne({
        where: { id },
      });
      if (announcement && announcement.likeCount > 0) {
        await this.announcementRepository.decrement({ id }, 'likeCount', 1);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to decrement like count for announcement ${id}: ${error.message}`,
      );
    }
  }

  async incrementShareCount(id: string): Promise<void> {
    try {
      await this.announcementRepository.increment({ id }, 'shareCount', 1);
    } catch (error) {
      this.logger.warn(
        `Failed to increment share count for announcement ${id}: ${error.message}`,
      );
    }
  }

  // Metadata methods
  async getTypes(): Promise<string[]> {
    try {
      return Object.values(AnnouncementType);
    } catch (error) {
      this.logger.error(
        `Failed to get announcement types: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const result = await this.announcementRepository
        .createQueryBuilder('announcement')
        .select('DISTINCT announcement.category', 'category')
        .where('announcement.category IS NOT NULL')
        .andWhere('announcement.deletedAt IS NULL')
        .getRawMany();

      return result
        .map((item) => item.category)
        .filter(Boolean)
        .sort();
    } catch (error) {
      this.logger.error(
        `Failed to get announcement categories: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllTags(): Promise<string[]> {
    try {
      const result = await this.announcementRepository
        .createQueryBuilder('announcement')
        .select('announcement.tags', 'tags')
        .where('announcement.tags IS NOT NULL')
        .andWhere('announcement.deletedAt IS NULL')
        .getMany();

      const allTags = new Set<string>();
      result.forEach((announcement) => {
        if (announcement.tags) {
          announcement.tags.forEach((tag) => allTags.add(tag));
        }
      });

      return Array.from(allTags).sort();
    } catch (error) {
      this.logger.error(
        `Failed to get all tags: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Statistics and analytics
  async getAnnouncementStatistics() {
    try {
      const [
        totalAnnouncements,
        publishedAnnouncements,
        activeAnnouncements,
        featuredAnnouncements,
        pinnedAnnouncements,
        totalViews,
        totalLikes,
        totalShares,
        typesCount,
        categoriesCount,
        tagsCount,
      ] = await Promise.all([
        this.announcementRepository.count({ where: { deletedAt: IsNull() } }),
        this.announcementRepository.count({
          where: { isPublished: true, deletedAt: IsNull() },
        }),
        this.announcementRepository.count({
          where: { isActive: true, deletedAt: IsNull() },
        }),
        this.announcementRepository.count({
          where: { isFeatured: true, deletedAt: IsNull() },
        }),
        this.announcementRepository.count({
          where: { isPinned: true, deletedAt: IsNull() },
        }),
        this.announcementRepository.sum('viewCount'),
        this.announcementRepository.sum('likeCount'),
        this.announcementRepository.sum('shareCount'),
        this.getTypes().then((types) => types.length),
        this.getCategories().then((categories) => categories.length),
        this.getAllTags().then((tags) => tags.length),
      ]);

      return {
        totalAnnouncements,
        publishedAnnouncements,
        draftAnnouncements: totalAnnouncements - publishedAnnouncements,
        activeAnnouncements,
        featuredAnnouncements,
        pinnedAnnouncements,
        totalViews: totalViews || 0,
        totalLikes: totalLikes || 0,
        totalShares: totalShares || 0,
        typesCount,
        categoriesCount,
        tagsCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get announcement statistics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Bulk operations
  async bulkUpdate(
    ids: string[],
    updateData: Partial<EventAnnouncement>,
  ): Promise<void> {
    try {
      if (ids.length === 0) return;

      await this.announcementRepository.update({ id: In(ids) }, updateData);

      this.logger.log(`Bulk updated ${ids.length} announcements`);
    } catch (error) {
      this.logger.error(
        `Failed to bulk update announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    try {
      if (ids.length === 0) return;

      await this.announcementRepository.softDelete({ id: In(ids) });

      this.logger.log(`Bulk deleted ${ids.length} announcements`);
    } catch (error) {
      this.logger.error(
        `Failed to bulk delete announcements: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Scheduled task for publishing scheduled announcements
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledAnnouncements(): Promise<void> {
    try {
      const now = new Date();
      const scheduledAnnouncements = await this.announcementRepository.find({
        where: {
          scheduledFor: LessThanOrEqual(now),
          isPublished: false,
          isActive: true,
          deletedAt: IsNull(),
        },
      });

      if (scheduledAnnouncements.length > 0) {
        const ids = scheduledAnnouncements.map((a) => a.id);
        await this.bulkUpdate(ids, {
          isPublished: true,
          publishedAt: now,
          scheduledFor: null,
        });

        this.logger.log(
          `Published ${scheduledAnnouncements.length} scheduled announcements`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to publish scheduled announcements: ${error.message}`,
        error.stack,
      );
    }
  }

  // Private utility methods
  private validateAnnouncementContent(dto: {
    title: string;
    content: string;
  }): void {
    if (!dto.title || dto.title.trim().length < 10) {
      throw new BadRequestException(
        'Title must be at least 10 characters long',
      );
    }

    if (dto.title.length > 255) {
      throw new BadRequestException('Title must not exceed 255 characters');
    }

    if (!dto.content || dto.content.trim().length < 50) {
      throw new BadRequestException(
        'Content must be at least 50 characters long',
      );
    }

    if (dto.content.length > 50000) {
      throw new BadRequestException(
        'Content must not exceed 50,000 characters',
      );
    }
  }

  private sanitizeContent(content: string): string {
    // Basic HTML sanitization - remove potentially dangerous elements
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  private calculateReadingTime(content: string): number {
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  private async generateUniqueSlug(
    title: string,
    excludeId?: string,
  ): Promise<string> {
    let baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100)
      .replace(/^-|-$/g, '');

    if (!baseSlug) {
      baseSlug = 'announcement';
    }

    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const whereCondition: FindOptionsWhere<EventAnnouncement> = { slug };
      if (excludeId) {
        whereCondition.id = { $ne: excludeId } as any;
      }

      const existing = await this.announcementRepository.findOne({
        where: whereCondition,
      });

      if (!existing) {
        break;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  private async validateSlug(slug: string, excludeId?: string): Promise<void> {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        'Slug can only contain lowercase letters, numbers, and hyphens',
      );
    }

    const whereCondition: FindOptionsWhere<EventAnnouncement> = { slug };
    if (excludeId) {
      whereCondition.id = { $ne: excludeId } as any;
    }

    const existing = await this.announcementRepository.findOne({
      where: whereCondition,
    });

    if (existing) {
      throw new BadRequestException('Slug already exists');
    }
  }

  private mapPriorityToNotificationPriority(
    priority: AnnouncementPriority,
  ): 'low' | 'medium' | 'high' | 'urgent' {
    switch (priority) {
      case AnnouncementPriority.LOW:
        return 'low';
      case AnnouncementPriority.NORMAL:
        return 'medium';
      case AnnouncementPriority.HIGH:
        return 'high';
      case AnnouncementPriority.URGENT:
        return 'urgent';
      default:
        return 'medium';
    }
  }
}

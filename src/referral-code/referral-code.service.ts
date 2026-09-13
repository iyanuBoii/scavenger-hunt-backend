import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralCode } from './entities/referral-code.entity';
import { CreateReferralCodeDto } from './dto/create-referral-code.dto';
import { TrackReferralCodeDto } from './dto/track-referral-code.dto';

@Injectable()
export class ReferralCodeService {
  constructor(
    @InjectRepository(ReferralCode)
    private readonly referralCodeRepository: Repository<ReferralCode>,
  ) {}

  async generateReferralCode(createDto: CreateReferralCodeDto): Promise<ReferralCode> {
    const code = this.generateCode();
    const referralCode = this.referralCodeRepository.create({
      code,
      ownerId: createDto.ownerId,
      usageCount: 0,
    });
    return this.referralCodeRepository.save(referralCode);
  }

  async trackReferralUsage(trackDto: TrackReferralCodeDto): Promise<ReferralCode> {
    const referralCode = await this.referralCodeRepository.findOne({ where: { code: trackDto.code } });
    if (!referralCode) {
      throw new NotFoundException('Referral code not found');
    }
    if (referralCode.ownerId === trackDto.invitedUserId) {
      throw new BadRequestException('You cannot use your own referral code');
    }
    referralCode.usageCount += 1;
    return this.referralCodeRepository.save(referralCode);
  }

  async getReferralCode(code: string): Promise<ReferralCode> {
    const referralCode = await this.referralCodeRepository.findOne({ where: { code } });
    if (!referralCode) {
      throw new NotFoundException('Referral code not found');
    }
    return referralCode;
  }

  private generateCode(length = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

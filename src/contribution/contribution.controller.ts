import { Controller, Post, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { ContributionsService } from './contribution.service';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { QueryContributionDto } from './dto/query-contribution.dto';

@Controller('contributions')
export class ContributionsController {
  constructor(private readonly service: ContributionsService) {}

  @Post()
  submit(@Body() dto: CreateContributionDto) {
    return this.service.submit(dto);
  }

  @Get('pending')
  getPending(@Query() query: QueryContributionDto) {
    return this.service.getPending(query);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }
}

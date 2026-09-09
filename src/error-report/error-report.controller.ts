import { Controller, Post, Body, Get, Param, Request, UseGuards } from '@nestjs/common';
import { ErrorReportService } from './error-report.service';
import { CreateErrorReportDto } from './dto/create-error-report.dto';
import { ErrorReportResponseDto } from './dto/error-report-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ErrorReportRateLimitGuard } from './guards/error-report-rate-limit.guard';

@Controller('error-reports')
export class ErrorReportController {
  constructor(private readonly errorReportService: ErrorReportService) {}

  @UseGuards(JwtAuthGuard, ErrorReportRateLimitGuard)
  @Post()
  async submitReport(@Request() req, @Body() dto: CreateErrorReportDto): Promise<ErrorReportResponseDto> {
    return this.errorReportService.submitReport(req.user.id, dto);
  }

  @Get()
  async getReports(): Promise<ErrorReportResponseDto[]> {
    return this.errorReportService.getReports();
  }

  @Get(':id')
  async getReportById(@Param('id') id: string): Promise<ErrorReportResponseDto> {
    return this.errorReportService.getReportById(id);
  }
} 
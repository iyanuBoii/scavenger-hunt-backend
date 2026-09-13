import { IsString, IsOptional, MinLength, MaxLength, Matches, IsUrl } from "class-validator"
import { Transform } from "class-transformer"

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value)

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: "Username must be at least 3 characters long" })
  @MaxLength(30, { message: "Username must not exceed 30 characters" })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "Username can only contain letters, numbers, underscores, and hyphens",
  })
  username?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: "Bio must not exceed 500 characters" })
  bio?: string

  @IsOptional()
  @IsUrl({}, { message: "Please provide a valid avatar URL" })
  avatarUrl?: string
}

export class UserResponseDto {
  id: string
  email: string
  walletAddress: string
  username?: string
  bio?: string
  avatarUrl?: string
  role: string
  status: string
  emailVerified: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

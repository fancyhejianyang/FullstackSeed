import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SaveDocumentParseRuleDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  textMaxSizeMb?: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(1000000)
  @IsOptional()
  textMaxLines?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  pdfPagesPerPart?: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(10000)
  @IsOptional()
  wordParagraphsPerPart?: number;

  @IsBoolean()
  @IsOptional()
  preferSentenceBoundary?: boolean;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}

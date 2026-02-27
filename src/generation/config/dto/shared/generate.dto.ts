import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ValidateNested,
  IsNotEmpty,
  IsObject,
  IsString,
} from 'class-validator';

export class GenerateParamsDto {
  // Dynamic key-value parameters
  [key: string]: any;
}

export class GenerateRequestDto {
  @ApiProperty({ description: 'The name of the model to use' })
  @IsString()
  @IsNotEmpty()
  modelName: string;

  @ApiProperty({
    description: 'Parameters for the selected model',
    type: Object,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => GenerateParamsDto)
  params: GenerateParamsDto;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export enum EConnectionType {
  EVM = 'evm',
  SOLANA = 'solana',
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Wallet address',
    example: '0x1234567890123456789012345678901234567890',
    required: true,
  })
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Sign message',
    example: '0x189284105974350948335031823419874859483685449504957',
    required: true,
  })
  signMessage: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Message',
    example: 'Welcome to the Platform',
    required: true,
  })
  message: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Type of connection',
    example: 'evm',
    required: true,
    enum: EConnectionType,
  })
  type: EConnectionType;

  constructor(
    walletAddress: string,
    signMessage: string,
    message: string,
    type: EConnectionType,
  ) {
    this.walletAddress = walletAddress;
    this.signMessage = signMessage;
    this.message = message;
    this.type = type;
  }
}

export class GetMessageDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Wallet address',
    example: '0x1234567890123456789012345678901234567890',
    required: true,
  })
  walletAddress: string;

  constructor(walletAddress: string) {
    this.walletAddress = walletAddress;
  }
}

export class LoginDTO {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Wallet address',
    example: '0x1234567890123456789012345678901234567890',
    required: true,
  })
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Signature from wallet',
    example: '0xabcdef123456...',
    required: true,
  })
  signature: string;

  // @IsNumber()
  // @IsNotEmpty()
  // @ApiProperty({
  //   description: 'Chain ID',
  //   example: 1,
  //   required: true,
  // })
  // chainId: number;

  constructor(walletAddress: string, signature: string, chainId: number) {
    this.walletAddress = walletAddress;
    this.signature = signature;
    // this.chainId = chainId;
  }
}
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: true,
  })
  refreshToken: string;
}

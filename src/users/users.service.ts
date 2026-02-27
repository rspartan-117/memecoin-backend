import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginDTO, RefreshTokenDto } from './dto/create-user.dto';
import { UpdateUserDetailsDto } from './dto/update-user.dto';
import { PrismaService } from 'src/shared/services/prisma.service';
import { SignJWT, jwtVerify } from 'jose';
import { CacheService } from 'src/shared/services/redis-cache.service';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  verifyMessage,
  isAddress,
  createPublicClient,
  http,
  Chain,
} from 'viem';
import {
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  base,
  baseSepolia,
  bsc,
  bscTestnet,
  avalanche,
  avalancheFuji,
} from 'viem/chains';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { FREE_CREDITS } from 'src/payments/constants';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class UsersService {
  private readonly chainMap: Record<number, Chain> = {
    1: mainnet,
    11155111: sepolia,
    137: polygon,
    80002: polygonAmoy,
    42161: arbitrum,
    421614: arbitrumSepolia,
    10: optimism,
    11155420: optimismSepolia,
    8453: base,
    84532: baseSepolia,
    56: bsc,
    97: bscTestnet,
    43114: avalanche,
    43113: avalancheFuji,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get chain configuration by chainId
   */
  private getChainById(chainId: number): Chain {
    const chain = this.chainMap[chainId];
    if (!chain) {
      throw new BadRequestException(
        `Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(this.chainMap).join(', ')}`,
      );
    }
    return chain;
  }

  async getMessage(walletAddress: string) {
    try {
      const data = await this.cacheService.getFromCache(
        `getMessage:${walletAddress}`,
      );

      if (data) {
        return data;
      } else {
        const nonce = Math.floor(Math.random() * 1000000);
        const msg = `Welcome to Meme Coin! Click to sign in.\n\nThis request will not trigger a blockchain transaction or cost any gas fees, it is just a way to verify your wallet address.\n\nWallet address: ${walletAddress}\nNonce: ${nonce}`;
        const item: { nonce: number; msg: string } = {
          nonce,
          msg,
        };
     // Cache nonce for 10 minutes to allow sufficient time for wallet signature
                const NONCE_TTL_MINUTES = 10;
                await this.cacheService.addToCacheWithCustomTime(
                    `getMessage:${walletAddress}`,
                    item,
                    NONCE_TTL_MINUTES / 60, // Convert minutes to hours for cache service
                );
                return { nonce, msg }
      }
    } catch (error) {
      throw error;
    }
  }

   async login(dto: LoginDTO) {
        const { walletAddress, signature } = dto;

        let EVMAddress: boolean = isAddress(walletAddress as Address);

        const data = await this.cacheService.getFromCache(
            `getMessage:${walletAddress}`,
        );
        if (!data) throw new BadRequestException('Authentication timeout');

        if (!EVMAddress) {
            const encodedMessage = new TextEncoder().encode(data.msg);
            const publicKey = new PublicKey(walletAddress);
            const publicKeyBytes = publicKey.toBytes();
            var signAddr = nacl.sign.detached.verify(
                encodedMessage,
                Buffer.from(signature, 'hex'),
                publicKeyBytes,
            );
        } else {
            var signAddr = await verifyMessage({
                address: walletAddress as Address,
                message: data.msg,
                signature: signature as `0x${string}`,
            });
        }

        if (!signAddr) throw new BadRequestException('Authentication Failed');

        this.cacheService.deleteFromCache(`getMessage:${walletAddress}`);

        const existingUser = await this.prisma.users.findUnique({
            where: {
                walletAddress: EVMAddress
                    ? walletAddress.toLowerCase()
                    : walletAddress,
            },
            select: {
                id: true,
            },
        });

        if (existingUser) {
            const tokens = await this.generateTokens({ id: existingUser.id });

            const refreshTokenExists =
                await this.prisma.refreshToken.findUnique({
                    where: { userId: existingUser.id },
                });

            const refreshTokenExpiryDays = parseInt(
                this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') ||
                    '7',
                10,
            );
            const expiresAt = new Date(
                Date.now() + refreshTokenExpiryDays * 24 * 60 * 60 * 1000,
            );
            const tokenData = {
                token: tokens.refreshToken,
                expiresAt,
                updatedAt: new Date(),
            };

            if (refreshTokenExists) {
                // Update the existing refresh token
                await this.prisma.refreshToken.update({
                    where: { userId: existingUser.id },
                    data: tokenData,
                });
            } else {
                // Create a new refresh token linked to the user
                await this.prisma.refreshToken.create({
                    data: {
                        ...tokenData,
                        user: { connect: { id: existingUser.id } },
                    },
                });
            }

            return {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                userId: existingUser.id,
            };
        } else {
            const createdUser = await this.prisma.users.create({
                data: {
                    walletAddress: EVMAddress
                        ? walletAddress.toLowerCase()
                        : walletAddress,
                    Credits: {
                        create: {
                            availableCredits:
                                parseFloat(
                                    this.configService.get<string>(
                                        'FREE_CREDITS',
                                    ) || FREE_CREDITS.toString(),
                                ) || FREE_CREDITS,
                        },
                    },
                },
                select: { id: true },
            });

            if (!createdUser) {
                throw new BadRequestException('Unable to Create Profile.');
            }

            const tokens = await this.generateTokens({ id: createdUser.id });

            const refreshTokenExpiryDays = parseInt(
                this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') ||
                    '7',
                10,
            );
            const expiresAt = new Date(
                Date.now() + refreshTokenExpiryDays * 24 * 60 * 60 * 1000,
            );

            await this.prisma.refreshToken.create({
                data: {
                    token: tokens.refreshToken,
                    expiresAt: expiresAt,
                    updatedAt: new Date(),
                    user: { connect: { id: createdUser.id } },
                },
                select: { id: true },
            });

            return {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                userId: createdUser.id,
            };
        }
    }

  // NEW: Refresh token method
  async refreshToken(dto: RefreshTokenDto) {
    const { refreshToken } = dto;

    try {
      // Verify the refresh token
      const secret = new TextEncoder().encode(
        this.configService.getOrThrow<string>('JWT_SECRET'),
      );
      const { payload } = await jwtVerify(refreshToken, secret);

      if (!payload.id) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if refresh token exists in database and is not expired
      const storedRefreshToken = await this.prisma.refreshToken.findUnique({
        where: { userId: payload.id as string },
        include: { user: true },
      });

      if (!storedRefreshToken) {
        throw new UnauthorizedException('Refresh token not found');
      }

      if (storedRefreshToken.token !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (storedRefreshToken.expiresAt < new Date()) {
        // Delete expired refresh token
        await this.prisma.refreshToken.delete({
          where: { userId: payload.id as string },
        });
        throw new UnauthorizedException('Refresh token expired');
      }

      // Generate new tokens
      const newTokens = await this.generateTokens({
        id: payload.id,
      });

      // Update refresh token in database
      const refreshTokenExpiryDays = parseInt(
        this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') || '7',
        10,
      );
      const expiresAt = new Date(
        Date.now() + refreshTokenExpiryDays * 24 * 60 * 60 * 1000,
      );

      await this.prisma.refreshToken.update({
        where: { userId: payload.id as string },
        data: {
          token: newTokens.refreshToken,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      return {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        userId: payload.id,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // NEW: Logout method (invalidate refresh token)
  async logout(userId: string) {
    try {
      await this.prisma.refreshToken.delete({
        where: { userId },
      });
      return { message: 'Logged out successfully' };
    } catch (error) {
      // If refresh token doesn't exist, consider it already logged out
      return { message: 'Logged out successfully' };
    }
  }

  // NEW: Verify access token method
  async verifyAccessToken(token: string) {
    try {
      const secret = new TextEncoder().encode(
        this.configService.getOrThrow<string>('JWT_SECRET'),
      );
      const { payload } = await jwtVerify(token, secret);
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async updateUserName(id: string, name: string) {
    const existingUser = await this.prisma.users.findUnique({
      where: { id },
      select: { id: true, username: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.users.update({
      where: { id },
      data: { username: name },
      select: { id: true, username: true },
    });

    return user;
  }

  async updateUserDetails(
    id: string,
    updateData: {
      username?: string;
      firstName?: string;
      lastName?: string;
      description?: string;
      profileImage?: string;
      coverImage?: string;
      email?: string;
    },
  ) {
    const existingUser = await this.prisma.users.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Remove undefined values to only update provided fields
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined),
    );

    if (Object.keys(cleanUpdateData).length === 0) {
      throw new BadRequestException('No fields provided to update');
    }

    const updatedUser = await this.prisma.users.update({
      where: { id },
      data: cleanUpdateData,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        description: true,
        profileImage: true,
        coverImage: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  generateToken(obj: any, expiresIn: string, secret: string) {
    return new SignJWT(obj)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${expiresIn}h`) // Set expiration time in hours
      .setIssuedAt()
      .sign(new TextEncoder().encode(secret));
  }

  async generateTokens(obj: object): Promise<Tokens> {
    const accessToken = await this.generateToken(
      obj,
      this.configService.get<string>('ACCESS_TOKEN_EXPIRY_HOURS') || '3',
      this.configService.getOrThrow<string>('JWT_SECRET'),
    );
    const refreshToken = await this.generateToken(
      obj,
      String((parseInt(this.configService.get<string>('REFRESH_TOKEN_EXPIRY_DAYS') || '7') * 24)), // Convert days to hours
      this.configService.getOrThrow<string>('JWT_SECRET'),
    );
    return { accessToken, refreshToken };
  }

  async getUser(id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
  }
}

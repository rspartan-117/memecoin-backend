import { Controller, Get, Post, Body, Patch, Query, Req, Delete, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, GetMessageDto, LoginDTO } from './dto/create-user.dto';
import { UpdateUserDetailsDto } from './dto/update-user.dto';
// import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserNameDto } from './dto/update-user-name.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AssetsService } from '../projects/services/assets.service';

@ApiTags('users')
@Controller('user')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly assetsService: AssetsService,
  ) {}

  @ApiOperation({ summary: 'Get sign message' })
  @ApiOkResponse({ description: 'Sign message' })
  @ApiBearerAuth()
  @Get('sign-message')
  signMessage(@Query() query: GetMessageDto) {
    const { walletAddress } = query;
    return this.usersService.getMessage(walletAddress);
  }

  @ApiOperation({ summary: 'Register a new user' })
  @ApiOkResponse({ description: 'User registered successfully' })
  @ApiBearerAuth()
  @Post('/login')
  async login(@Body() dto: LoginDTO) {
    return await this.usersService.login(dto);
  }

  @ApiOperation({ summary: 'Get User Details' })
  @ApiOkResponse({ description: 'Get user Details based on user ID' })
  @ApiBearerAuth()
  @Get('/get-user')
  async getUser(@Req() req: Request) {
    const userId = req.user as string;
    return await this.usersService.getUser(userId);
  }

  @ApiOperation({ summary: 'Update User Name by ID' })
  @ApiOkResponse({ description: 'User name updated successfully' })
  @ApiBody({ type: UpdateUserNameDto })
  @ApiBearerAuth()
  @Patch('/update-name')
  async updateUserName(
    @Body() updateUserNameDto: UpdateUserNameDto,
    @Req() req: Request,
  ) {
    const userId = req.user as string;
    return await this.usersService.updateUserName(
      userId,
      updateUserNameDto.name,
    );
  }

  @Post('/auth/refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({ description: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  async getNewAccessToken(@Body() dto: RefreshTokenDto) {
    return await this.usersService.refreshToken(dto);
  }

  @ApiOperation({ summary: 'Update User Details' })
  @ApiOkResponse({ description: 'User details updated successfully' })
  @ApiBody({ type: UpdateUserDetailsDto })
  @ApiBearerAuth()
  @Patch('/update-details')
  async updateUserDetails(
    @Body() updateUserDetailsDto: UpdateUserDetailsDto,
    @Req() req: Request,
  ) {
    const userId = req.user as string;
    return await this.usersService.updateUserDetails(
      userId,
      updateUserDetailsDto,
    );
  }

  @ApiOperation({ summary: 'Delete all user assets' })
  @ApiOkResponse({ 
    description: 'All user assets deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deletedCount: { type: 'number', example: 10 },
        s3DeletedCount: { type: 'number', example: 10 },
        errors: { type: 'array', items: { type: 'string' }, example: [] },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to delete user assets',
  })
  @ApiBearerAuth()
  @Delete('/assets')
  async deleteAllUserAssets(@Req() req: Request) {
    try {
      const userId = req.user as string;
      this.logger.log(`Deleting all assets for user ${userId}`);
      return await this.assetsService.deleteAllUserAssets(userId);
    } catch (error) {
      this.logger.error(`Delete all user assets error: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to delete user assets',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

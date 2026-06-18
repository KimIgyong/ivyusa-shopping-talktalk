import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Principal } from '@ivy/types';
import { AuthService } from './auth.service';
import { ChangePasswordRequest, LoginRequest, RefreshRequest } from './dto/request/login.request';
import { Public } from '../../global/decorator/public.decorator';
import { Auth } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  @Public()
  @ApiOperation({ summary: 'System admin login (super_admin/admin)' })
  loginAdmin(@Body() body: LoginRequest) {
    return this.authService.loginAdmin(body.email, body.password);
  }

  @Post('user/login')
  @Public()
  @ApiOperation({ summary: 'Tenant user login (master/director/manager/staff)' })
  loginUser(@Body() body: LoginRequest) {
    return this.authService.loginUser(body.email, body.password, body.shop_domain);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: RefreshRequest) {
    return this.authService.refresh(body.refresh_token);
  }

  @Post('change-password')
  @Auth()
  @ApiOperation({ summary: 'Change password (clears must-change flag)' })
  async changePassword(@CurrentUser() user: Principal, @Body() body: ChangePasswordRequest) {
    await this.authService.changePassword(user, body.current_password, body.new_password);
    return { changed: true };
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Current principal' })
  me(@CurrentUser() user: Principal) {
    return this.authService.me(user);
  }
}

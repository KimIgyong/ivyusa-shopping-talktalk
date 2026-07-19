import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Principal } from '@ivy/types';
import { AuthService } from './auth.service';
import {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
} from './dto/request/login.request';
import { Public } from '../../global/decorator/public.decorator';
import { Auth } from '../../global/decorator/auth.decorator';
import { AllowPendingPassword } from '../../global/decorator/allow-pending-password.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';

/** Client IP for rate limiting: the first X-Forwarded-For hop (set by the edge
 *  nginx) if present, else the direct socket address. */
function clientIp(xff: string | undefined, ip: string): string {
  const first = xff?.split(',')[0]?.trim();
  return first || ip || 'unknown';
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  @Public()
  @ApiOperation({ summary: 'System admin login (super_admin/admin)' })
  loginAdmin(
    @Body() body: LoginRequest,
    @Ip() ip: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.authService.loginAdmin(body.email, body.password, clientIp(xff, ip));
  }

  @Post('user/login')
  @Public()
  @ApiOperation({ summary: 'Tenant user login (master/director/manager/staff)' })
  loginUser(
    @Body() body: LoginRequest,
    @Ip() ip: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.authService.loginUser(body.email, body.password, clientIp(xff, ip), body.shop_domain);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: RefreshRequest) {
    return this.authService.refresh(body.refresh_token);
  }

  @Post('change-password')
  @Auth()
  @AllowPendingPassword()
  @ApiOperation({ summary: 'Change password (clears must-change flag, returns fresh tokens)' })
  changePassword(@CurrentUser() user: Principal, @Body() body: ChangePasswordRequest) {
    return this.authService.changePassword(user, body.current_password, body.new_password);
  }

  @Post('logout')
  @Auth()
  @AllowPendingPassword()
  @ApiOperation({ summary: 'Log out (revokes the presented refresh token)' })
  async logout(@Body() body: LogoutRequest) {
    await this.authService.logout(body.refresh_token);
    return { loggedOut: true };
  }

  @Get('me')
  @Auth()
  @AllowPendingPassword()
  @ApiOperation({ summary: 'Current principal' })
  me(@CurrentUser() user: Principal) {
    return this.authService.me(user);
  }
}

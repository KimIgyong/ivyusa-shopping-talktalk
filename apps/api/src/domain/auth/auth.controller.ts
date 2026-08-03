import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Principal } from '@ivy/types';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
} from './dto/request/login.request';
import {
  MfaDisableRequest,
  MfaEnrollVerifyRequest,
  MfaVerifyRequest,
} from './dto/request/mfa.request';
import { Public } from '../../global/decorator/public.decorator';
import { Auth } from '../../global/decorator/auth.decorator';
import { AllowPendingPassword } from '../../global/decorator/allow-pending-password.decorator';
import { AllowPendingMfa } from '../../global/decorator/allow-pending-mfa.decorator';
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
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

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
    return this.authService.loginUser(
      body.email,
      body.password,
      clientIp(xff, ip),
      body.shop_domain,
      body.tenant_slug,
    );
  }

  // ---- MFA (PLN-MFA Stage M1) ----

  @Post('mfa/verify')
  @Public()
  @ApiOperation({ summary: 'Step-up login: exchange mfa_token + TOTP/recovery code for tokens' })
  verifyMfa(
    @Body() body: MfaVerifyRequest,
    @Ip() ip: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.authService.verifyMfa(body.mfa_token, body.code, clientIp(xff, ip));
  }

  @Get('mfa/status')
  @Auth()
  @AllowPendingMfa()
  @ApiOperation({ summary: 'MFA enrollment status for the current account' })
  mfaStatus(@CurrentUser() user: Principal) {
    return this.mfaService.status(user);
  }

  @Post('mfa/enroll')
  @Auth()
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Start MFA enrollment (returns otpauth URI + manual key ONCE)' })
  mfaEnroll(@CurrentUser() user: Principal) {
    return this.mfaService.enroll(user);
  }

  @Post('mfa/enroll/verify')
  @Auth()
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Confirm enrollment with a first TOTP; returns one-time recovery codes' })
  async mfaEnrollVerify(@CurrentUser() user: Principal, @Body() body: MfaEnrollVerifyRequest) {
    const { recoveryCodes } = await this.mfaService.enrollVerify(user, body.code);
    // Fresh pair so the client can drop a mfaPending-locked token at once (M3).
    const tokens = await this.authService.reissueAfterMfaEnroll(user);
    return { recoveryCodes, tokens };
  }

  @Post('mfa/disable')
  @Auth()
  @ApiOperation({ summary: 'Disable MFA (requires password + TOTP/recovery code)' })
  mfaDisable(
    @CurrentUser() user: Principal,
    @Body() body: MfaDisableRequest,
    @Ip() ip: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.mfaService.disable(user, body.password, body.code, clientIp(xff, ip));
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
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Change password (clears must-change flag, returns fresh tokens)' })
  changePassword(@CurrentUser() user: Principal, @Body() body: ChangePasswordRequest) {
    return this.authService.changePassword(user, body.current_password, body.new_password);
  }

  @Post('logout')
  @Auth()
  @AllowPendingPassword()
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Log out (revokes the presented refresh token)' })
  async logout(@Body() body: LogoutRequest) {
    await this.authService.logout(body.refresh_token);
    return { loggedOut: true };
  }

  @Get('me')
  @Auth()
  @AllowPendingPassword()
  @AllowPendingMfa()
  @ApiOperation({ summary: 'Current principal' })
  me(@CurrentUser() user: Principal) {
    return this.authService.me(user);
  }
}

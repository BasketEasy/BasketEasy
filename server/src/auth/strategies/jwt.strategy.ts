import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // The `!` is safe: AppModule's ConfigModule.forRoot({ validate }) fails
      // fast at boot if JWT_ACCESS_SECRET is missing/too short, so by the
      // time any Nest provider (including this strategy) is constructed the
      // value is guaranteed present.
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
      // Explicit allow-list: defense-in-depth against alg-confusion if the
      // secret's shape or a future library default ever changes. Not
      // currently exploitable (jsonwebtoken defaults to HMAC for a
      // plain-string secret), but cheap to pin down.
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): { id: string; email: string } {
    return { id: payload.sub, email: payload.email };
  }
}

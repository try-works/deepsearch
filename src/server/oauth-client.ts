/**
 * The dsh authorization endpoints (R3): init, exchange, cancel.
 *
 * Every call goes through an injected transport so the whole flow can be driven
 * against a stub Platform. Envelope handling is strict: a non-zero `code`, a
 * non-zero `biz_code`, a non-2xx status, and a malformed body are four distinct
 * failures, and none of them is ever reported as success.
 */
import { Effect, Schema } from "effect";
import { OAuthRejected, ProtocolError, TransportError } from "../lib/errors";

export interface OAuthTransportResult {
  readonly status: number;
  readonly text: string;
}

export interface OAuthTransport {
  post(url: string, body: string, headers: Readonly<Record<string, string>>): Promise<OAuthTransportResult>;
}

export interface OAuthConfig {
  readonly platformOrigin: string;
  readonly clientVersion: string;
  readonly locale: string;
  readonly timezoneOffset: string;
}

export interface InitInput {
  readonly challenge: string;
  readonly state: string;
  readonly redirectUri: string;
}

export interface InitResult {
  readonly authorizeUrl: string;
  readonly authorizeId: string;
  readonly expiresIn: number;
}

export interface ExchangeInput {
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly deviceId: string;
  readonly osVersion: string;
}

export interface ExchangeResult {
  readonly token: string;
  readonly authorizedUrl: string;
}

export interface CancelInput {
  readonly authorizeId: string;
  readonly verifier: string;
}

/** Everything an auth call can fail with. */
export type OAuthError = TransportError | ProtocolError | OAuthRejected;

const Envelope = Schema.Struct({
  code: Schema.Number,
  data: Schema.Union([
    Schema.Struct({ biz_code: Schema.Number, biz_data: Schema.Unknown }),
    Schema.Null,
  ]),
});

const InitData = Schema.Struct({
  authorize_url: Schema.String,
  authorize_id: Schema.String,
  expires_in: Schema.Number,
});

const ExchangeData = Schema.Struct({
  token: Schema.String,
  authorized_url: Schema.String,
});

interface EnvelopePayload {
  readonly bizData: unknown;
}

/** One POST, with the envelope unwrapped and every failure tagged. */
function post(
  transport: OAuthTransport,
  config: OAuthConfig,
  method: string,
  body: Readonly<Record<string, string>>,
): Effect.Effect<EnvelopePayload, OAuthError> {
  const headers = {
    "content-type": "application/json",
    "x-client-bundle-id": "",
    "x-client-platform": "web",
    "x-client-version": config.clientVersion,
    "x-client-locale": config.locale,
    "x-client-timezone-offset": config.timezoneOffset,
  };
  const url = `${config.platformOrigin}/auth-api/v0/dsh/${method}`;

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => transport.post(url, JSON.stringify(body), headers),
      catch: () => new TransportError({ message: `the ${method} request could not be sent` }),
    });

    if (response.status < 200 || response.status >= 300) {
      return yield* new TransportError({ message: `${method} returned status ${response.status}` });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      return yield* new ProtocolError({ message: `${method} returned a body that is not JSON` });
    }

    const envelope = yield* Schema.decodeUnknownEffect(Envelope)(parsed).pipe(
      Effect.mapError(() => new ProtocolError({ message: `${method} returned an unexpected envelope` })),
    );

    if (envelope.code !== 0) {
      return yield* new OAuthRejected({ message: `${method} was rejected with code ${envelope.code}`, code: envelope.code });
    }
    if (envelope.data === null) {
      return yield* new ProtocolError({ message: `${method} returned no data` });
    }
    if (envelope.data.biz_code !== 0) {
      return yield* new OAuthRejected({
        message: `${method} was rejected with business code ${envelope.data.biz_code}`,
        code: envelope.data.biz_code,
      });
    }
    return { bizData: envelope.data.biz_data };
  });
}

export interface OAuthClient {
  init(input: InitInput): Effect.Effect<InitResult, OAuthError>;
  exchange(input: ExchangeInput): Effect.Effect<ExchangeResult, OAuthError>;
  cancel(input: CancelInput): Effect.Effect<void, OAuthError>;
}

export function oauthClient(transport: OAuthTransport, config: OAuthConfig): OAuthClient {
  return {
    init: (input) =>
      post(transport, config, "auth_init", {
        code_challenge: input.challenge,
        code_challenge_method: "S256",
        state: input.state,
        redirect_uri: input.redirectUri,
        locale: config.locale,
        login_source: "web",
      }).pipe(
        Effect.flatMap((payload) =>
          Schema.decodeUnknownEffect(InitData)(payload.bizData).pipe(
            Effect.map((data) => ({
              authorizeUrl: data.authorize_url,
              authorizeId: data.authorize_id,
              expiresIn: data.expires_in,
            })),
            Effect.mapError(() => new ProtocolError({ message: "auth_init returned an unexpected payload" })),
          ),
        ),
      ),

    exchange: (input) =>
      post(transport, config, "auth_exchange", {
        code: input.code,
        code_verifier: input.verifier,
        redirect_uri: input.redirectUri,
        device_id: input.deviceId,
        device_model: "web",
        os_version: input.osVersion,
      }).pipe(
        Effect.flatMap((payload) =>
          Schema.decodeUnknownEffect(ExchangeData)(payload.bizData).pipe(
            Effect.map((data) => ({ token: data.token, authorizedUrl: data.authorized_url })),
            Effect.mapError(() => new ProtocolError({ message: "auth_exchange returned an unexpected payload" })),
          ),
        ),
      ),

    cancel: (input) =>
      post(transport, config, "auth_cancel", {
        authorize_id: input.authorizeId,
        code_verifier: input.verifier,
      }).pipe(Effect.asVoid),
  };
}

/** The live transport for Cloudflare Workers and Node, both of which have fetch. */
export function oauthFetchTransport(implementation: typeof fetch = fetch): OAuthTransport {
  return {
    post: (url, body, headers) =>
      implementation(url, { method: "POST", headers, body }).then((response) =>
        response.text().then((text) => ({ status: response.status, text })),
      ),
  };
}
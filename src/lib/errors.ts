/**
 * The error taxonomy shared by client and server (R11, R12).
 *
 * Every failure the app can render is a tagged error here, so a route or a
 * component branches on a tag rather than on a status code or a message.
 */
import { Schema } from "effect";

/** No credential is configured yet. */
export class CredentialMissing extends Schema.TaggedError<CredentialMissing>()("CredentialMissing", {
  message: Schema.String,
}) {}

/** The Platform rejected the credential (HTTP 401). */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
  status: Schema.Number,
}) {}

/** The Platform rate-limited the request (HTTP 429). */
export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  message: Schema.String,
}) {}

/** The request could not complete: network, timeout, or an unexpected status. */
export class TransportError extends Schema.TaggedError<TransportError>()("Transport", {
  message: Schema.String,
}) {}

/** A response did not match the documented contract. */
export class ProtocolError extends Schema.TaggedError<ProtocolError>()("ProtocolError", {
  message: Schema.String,
}) {}

/** A sign-in attempt is missing, tampered with, or does not match its state. */
export class AttemptInvalid extends Schema.TaggedError<AttemptInvalid>()("AttemptInvalid", {
  message: Schema.String,
}) {}
/** The Platform refused an authorization request with a business code. */
export class OAuthRejected extends Schema.TaggedError<OAuthRejected>()("OAuthRejected", {
  message: Schema.String,
  code: Schema.Number,
}) {}
/** Local storage refused a write. */
export class StorageError extends Schema.TaggedError<StorageError>()("Storage", {
  message: Schema.String,
}) {}

/** A pending authorization attempt expired. */
export class Expired extends Schema.TaggedError<Expired>()("Expired", {
  message: Schema.String,
}) {}

/** Everything a search can fail with. */
export type SearchError =
  | CredentialMissing
  | Unauthorized
  | RateLimited
  | TransportError
  | ProtocolError;

/** Everything credential handling can fail with. */
export type CredentialError = CredentialMissing | StorageError | Expired;

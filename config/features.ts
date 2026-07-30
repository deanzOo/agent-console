/**
 * Which optional integrations this deployment has credentials for.
 *
 * Everything except the core mission loop is optional, because this app is
 * installed by people who use a different subset of services than you do. An
 * unconfigured integration is a supported state: the nav hides it and its API
 * routes return 404, rather than throwing from an undefined client.
 */
export interface Features {
  readonly github: boolean;
  readonly asana: boolean;
  readonly push: boolean;
  readonly telegram: boolean;
}

/** Credentials, already merged across env vars and the settings table. */
export interface FeatureCredentials {
  readonly githubToken?: string | undefined;
  readonly asanaToken?: string | undefined;
  readonly vapidPublicKey?: string | undefined;
  readonly vapidPrivateKey?: string | undefined;
  readonly telegramBotToken?: string | undefined;
  readonly telegramChatId?: string | undefined;
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

export function getFeatures(credentials: FeatureCredentials): Features {
  return {
    github: isSet(credentials.githubToken),
    asana: isSet(credentials.asanaToken),
    // Web push signs every notification, so a half-configured keypair is unusable.
    push: isSet(credentials.vapidPublicKey) && isSet(credentials.vapidPrivateKey),
    // A bot token with no chat id has nowhere to deliver.
    telegram: isSet(credentials.telegramBotToken) && isSet(credentials.telegramChatId),
  };
}

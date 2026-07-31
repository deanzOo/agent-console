export interface User {
  readonly id: string;
  readonly email: string | undefined;
}

export interface AuthAdapter {
  // Null rather than throwing: absent, malformed, expired and wrong-audience
  // are all one 401 path for the caller.
  getUser(request: Request): Promise<User | null>;
}

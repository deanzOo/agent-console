// Values the user interface and the server both need to agree on. Kept in a
// module with no imports so a client bundle can read them without dragging in
// the database or the push library.

// Short enough to type on a phone, long enough that scrypt is doing real work.
// The deployment is behind a reverse proxy and a single operator's password,
// not a public signup form.
export const MIN_PASSWORD_LENGTH = 8;

export function isOwnerEmail(email: string | null | undefined, ownerEmail = process.env.OWNER_EMAIL) {
  return Boolean(
    email && ownerEmail && email.trim().toLowerCase() === ownerEmail.trim().toLowerCase(),
  );
}

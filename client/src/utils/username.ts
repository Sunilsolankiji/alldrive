/** Google account username: the part of the email before "@" (unique per drive, unlike display names). */
export const username = (email: string) => email.split('@')[0] || email

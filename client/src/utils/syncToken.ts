/** Returns the localStorage key for this account's server sync token. */
export const syncTokenKey = (accountId: string) => `alldrive_sync_token_${accountId}`

// Secret paths for the management pages (the old /admin and /super-admin no longer work).
export const ADMIN_PATH = '/Nwd4aJiepNwDiD9BmRNrHnbYVqcGqqoy'
export const SUPER_ADMIN_PATH = '/4aZcqAoC4LbKsWVf7RTFTvtKZeeUy2CB'

// Key the super admin must type to download the JSON file.
// Only the server code (worker/ and vite.config.ts) imports this, so it is not included in the
// browser bundle. A Cloudflare secret DOWNLOAD_PASSWORD, if set, takes priority over it.
export const DOWNLOAD_KEY = 'oCrYR0rX5yokG8iaJwK80Qcd57gqds7O'

// Secret paths for the management pages (the old /admin and /super-admin no longer work).
export const ADMIN_PATH = '/Nwd4aJiepNwDiD9BmRNrHnbYVqcGqqoyrLOW5r4h51RKMCf5JsTV2Z8gZQMWIkqUggsh0I47iXpeG6ATXUCYoGbWrvtucAKP'
export const SUPER_ADMIN_PATH = '/4aZcqAoC4LbKsWVf7RTFTvtKZeeUy2CBpfmOdNNcRBYlta40VVcjZNbTQeZiEqK86zXf187o2zIxh6sLq9wJl8XEX2C9yMwc'
// Người đóng góp: may only add members and edit/delete members not approved yet.
export const CONTRIBUTOR_PATH = '/dong-gop'

// Key the super admin must type to download the JSON file.
// Only the server code (worker/ and vite.config.ts) imports this, so it is not included in the
// browser bundle. A Cloudflare secret DOWNLOAD_PASSWORD, if set, takes priority over it.
export const DOWNLOAD_KEY = 'oCrYR0rX5yokG8iaJwK80Qcd57gqds7O'

// Password the super admin must type to approve pending changes (publish them to the view page).
// Server-only, like DOWNLOAD_KEY. A Cloudflare secret APPROVE_PASSWORD, if set, takes priority.
export const APPROVE_KEY = 'swwQ1oEixZ4k1XYziF7uuua1IozOAcyE'

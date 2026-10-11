// Cloudflare Worker entry: serves /api/family-db and hands everything else to the static assets (Vite build in ./dist).
import { onRequestExport, onRequestGet, onRequestPut } from './family-db'

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  FAMILY_DB_KV?: {
    get(key: string): Promise<string | null>
    put(key: string, value: string): Promise<void>
  }
  DOWNLOAD_PASSWORD?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/family-db/export') {
      if (request.method === 'POST') {
        return onRequestExport({ request, env })
      }

      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
    }

    if (url.pathname === '/api/family-db') {
      if (request.method === 'GET') {
        return onRequestGet({ request, env })
      }

      if (request.method === 'PUT') {
        return onRequestPut({ request, env })
      }

      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, PUT' } })
    }

    return env.ASSETS.fetch(request)
  },
}

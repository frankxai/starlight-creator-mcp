import { createServer as createHttpServer, type Server } from 'node:http'
import { createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins, originValidationResponse } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createCreatorServer, type CreatorServerOptions } from './create-server.js'
import { defaultProviders, packsFromEnv } from './defaults.js'

export interface HttpOptions { port?: number; host?: string; path?: string; bearerToken?: string }

export async function serveCreatorHttp(serverOpts: Partial<CreatorServerOptions> = {}, http: HttpOptions = {}): Promise<{ server: Server; url: string }> {
  const mcpPath = http.path ?? '/mcp'
  const host = http.host ?? '127.0.0.1'
  const port = http.port ?? Number(process.env.PORT ?? 8787)
  const token = http.bearerToken ?? process.env.CREATOR_MCP_TOKEN
  const handler = createMcpHandler(async () => {
    const { server } = await createCreatorServer({ name: serverOpts.name ?? 'starlight-creator-mcp', version: serverOpts.version ?? '0.1.0', packs: serverOpts.packs ?? packsFromEnv(), providers: serverOpts.providers ?? defaultProviders, ...serverOpts })
    return server
  }, { legacy: 'stateless' })
  const guarded = { fetch: async (request: Request) => hostHeaderValidationResponse(request, localhostAllowedHostnames()) ?? originValidationResponse(request, localhostAllowedOrigins()) ?? handler.fetch(request) }
  const node = toNodeHandler(guarded)
  const server = createHttpServer((req, res) => {
    if (req.url === '/health') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true })); return }
    if (!req.url?.startsWith(mcpPath)) { res.statusCode = 404; res.end('not found'); return }
    if (token && req.headers.authorization !== `Bearer ${token}`) { res.statusCode = 401; res.setHeader('www-authenticate', 'Bearer'); res.end('unauthorized'); return }
    void node(req, res)
  })
  await new Promise<void>(resolve => server.listen(port, host, resolve))
  const addr = server.address()
  const url = `http://${host}:${typeof addr === 'object' && addr ? addr.port : port}${mcpPath}`
  return { server, url }
}

if (process.argv[1] && /http\.(js|ts)$/.test(process.argv[1])) {
  serveCreatorHttp().then(({ url }) => process.stderr.write(`creator-mcp http listening at ${url}\n`)).catch(err => { process.stderr.write(`${(err as Error).stack ?? err}\n`); process.exit(1) })
}

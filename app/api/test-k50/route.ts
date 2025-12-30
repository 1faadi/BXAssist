export const runtime = 'nodejs' // Ensure this runs in the Node.js runtime
export const dynamic = 'force-dynamic'

// zklib-js is CommonJS; use require to avoid ESM interop issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZKLib = require('zklib-js')

export async function GET() {
  const ip = process.env.K50_IP || '192.168.0.200'
  const port = process.env.K50_PORT ? Number(process.env.K50_PORT) : 4370

  const zk = new ZKLib(ip, port, 10000, 5000)

  try {
    // In zklib-js, createSocket throws on error and returns void; no boolean check needed.
    await zk.createSocket()

    let info: any = null
    try {
      info = await zk.getInfo()
    } catch (err: any) {
      info = { error: String(err) }
    }

    await zk.disconnect().catch(() => {})

    return new Response(
      JSON.stringify({
        success: true,
        ip,
        port,
        info,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err: any) {
    try {
      await zk.disconnect()
    } catch {
      // ignore
    }

    const errorPayload =
      err && typeof err === 'object'
        ? {
            message: err.message ?? String(err),
            code: err.code,
            name: err.name,
            stack: err.stack,
            ...err,
          }
        : { message: String(err) }

    return new Response(
      JSON.stringify({
        success: false,
        ip,
        port,
        error: errorPayload,
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    )
  }
}



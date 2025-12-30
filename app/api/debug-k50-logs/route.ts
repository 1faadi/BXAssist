export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// eslint-disable-next-line
const ZKLib = require('zklib-js')

export async function GET() {
  const ip = process.env.K50_IP || '192.168.0.200'
  const port = process.env.K50_PORT ? Number(process.env.K50_PORT) : 4370

  const zk = new ZKLib(ip, port, 10000, 5000)

  try {
    await zk.createSocket()
    const res = await zk.getAttendances()
    await zk.disconnect()

    const rows: any[] = Array.isArray(res) ? res : res?.data || []
    return new Response(
      JSON.stringify(
        {
          count: rows.length,
          sample: rows.slice(0, 10),
        },
        null,
        2
      ),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err: any) {
    try {
      await zk.disconnect()
    } catch {}
    return new Response(
      JSON.stringify(
        {
          error: err?.message || String(err),
        },
        null,
        2
      ),
      { status: 500, headers: { 'content-type': 'application/json' } }
    )
  }
}



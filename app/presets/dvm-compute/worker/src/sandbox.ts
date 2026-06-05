import { getQuickJS } from 'quickjs-emscripten'
import type { Event, Filter } from 'nostr-tools'
import { collect } from './nostr.js'
import { config } from './config.js'

export type SandboxInputs = {
  subject?: { value: string; type: string }
  params: Record<string, string>
}

// A mediated nostr API is the ONLY capability handed to scripts: no fs, net, process, timers.
const makeQueryFn = (defaultRelays: string[]) => {
  let fetched = 0
  return async (filtersJson: string, relaysJson: string): Promise<string> => {
    const filters = JSON.parse(filtersJson) as Filter[]
    const provided = relaysJson ? (JSON.parse(relaysJson) as string[] | null) : null
    const relays = Array.isArray(provided) && provided.length ? provided : defaultRelays
    // maxEventsPerJob <= 0 means unlimited; otherwise cap the total fetched across all queries.
    const cap = config.limits.maxEventsPerJob
    const remaining = cap > 0 ? cap - fetched : Infinity
    if (remaining <= 0) return JSON.stringify([])
    const events: Event[] = await collect(relays, filters, {
      timeoutMs: config.limits.sourceQueryTimeoutMs,
      max: remaining,
    })
    fetched += events.length
    return JSON.stringify(events)
  }
}

export type RunLimits = { maxRuntimeMs: number; maxMemoryMb: number }

// Scripts must define: async function main(inputs, nostr) { ... return <json-serializable> }
export const runScript = async (
  code: string,
  inputs: SandboxInputs,
  sourceRelays: string[],
  limits?: RunLimits,
): Promise<unknown> => {
  const maxRuntimeMs = limits?.maxRuntimeMs ?? config.limits.maxRuntimeMs
  const maxMemoryMb = limits?.maxMemoryMb ?? config.limits.maxMemoryMb
  const QuickJS = await getQuickJS()
  const runtime = QuickJS.newRuntime()
  runtime.setMemoryLimit(maxMemoryMb * 1024 * 1024)
  runtime.setMaxStackSize(1024 * 512)
  // Budget counts script CPU only: time spent awaiting nostr.query (host network I/O) is
  // credited back to the deadline, so a slow source relay doesn't trip the interrupt.
  let deadline = Date.now() + maxRuntimeMs
  runtime.setInterruptHandler(() => Date.now() > deadline)

  const ctx = runtime.newContext()
  try {
    const query = makeQueryFn(sourceRelays)
    // __query returns a VM promise; the host resolves it once the async collect() finishes, then
    // pumps the VM's pending jobs so the script's await chain advances. This is the standard
    // quickjs-emscripten async bridge (deferred promise + executePendingJobs).
    const queryFn = ctx.newFunction('__query', (filtersHandle, relaysHandle) => {
      const filtersJson = ctx.getString(filtersHandle)
      const relaysJson = relaysHandle ? ctx.getString(relaysHandle) : ''
      const deferred = ctx.newPromise()
      const t0 = Date.now()
      query(filtersJson, relaysJson).then(
        (json) => {
          deadline += Date.now() - t0
          const h = ctx.newString(json)
          deferred.resolve(h)
          h.dispose()
        },
        (err: unknown) => {
          deadline += Date.now() - t0
          const h = ctx.newString(err instanceof Error ? err.message : String(err))
          deferred.reject(h)
          h.dispose()
        },
      )
      deferred.settled.then(() => runtime.executePendingJobs())
      return deferred.handle
    })
    ctx.setProp(ctx.global, '__query', queryFn)
    queryFn.dispose()

    const inputsHandle = ctx.newString(JSON.stringify(inputs))
    ctx.setProp(ctx.global, '__inputsJson', inputsHandle)
    inputsHandle.dispose()

    const harness = `
      globalThis.inputs = JSON.parse(globalThis.__inputsJson);
      globalThis.nostr = {
        query: (filters, relays) => globalThis.__query(JSON.stringify(filters || []), JSON.stringify(relays || null)).then((s) => JSON.parse(s)),
      };
      ${code}
      ;(() => {
        if (typeof main !== 'function') throw new Error('script must define async function main(inputs, nostr)');
        globalThis.__p = Promise.resolve(main(globalThis.inputs, globalThis.nostr));
      })();
      globalThis.__p
    `

    const evalResult = ctx.evalCode(harness)
    if (evalResult.error) {
      const err = ctx.dump(evalResult.error)
      evalResult.error.dispose()
      throw new Error(`script error: ${typeof err === 'string' ? err : JSON.stringify(err)}`)
    }
    const promiseHandle = evalResult.value
    const resultPromise = ctx.resolvePromise(promiseHandle)
    promiseHandle.dispose()
    runtime.executePendingJobs()

    const resolved = await resultPromise
    if (resolved.error) {
      const err = ctx.dump(resolved.error)
      resolved.error.dispose()
      throw new Error(`script error: ${typeof err === 'string' ? err : JSON.stringify(err)}`)
    }
    const result = ctx.dump(resolved.value)
    resolved.value.dispose()

    const serialized = JSON.stringify(result ?? null)
    if (serialized.length > config.limits.maxOutputBytes) {
      throw new Error(`output exceeds max size (${config.limits.maxOutputBytes} bytes)`)
    }
    return result
  } finally {
    ctx.dispose()
    runtime.dispose()
  }
}

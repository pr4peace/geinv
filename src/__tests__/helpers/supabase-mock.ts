type Call = { method: string; args: unknown[] }

function createBuilder(data: unknown, error: unknown = null) {
  const calls: Call[] = []

  const builder: Record<string, unknown> & { _calls: Call[] } = {
    _calls: calls,
    then(
      onfulfilled: (v: { data: unknown; error: unknown }) => unknown,
      onrejected?: (e: unknown) => unknown
    ) {
      return Promise.resolve({ data, error }).then(onfulfilled, onrejected)
    },
  }

  const methods = [
    'select', 'eq', 'is', 'in', 'gte', 'lte', 'lt', 'neq',
    'update', 'insert', 'upsert', 'delete',
    'single', 'maybeSingle', 'order', 'limit',
  ]
  for (const method of methods) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }

  return builder
}

export type MockBuilder = ReturnType<typeof createBuilder>

export interface SupabaseMock {
  from: (table: string) => MockBuilder
  _allBuilders: Array<{ table: string; builder: MockBuilder }>
}

/**
 * tableDataSeries: { tableName: [data for 1st call, data for 2nd call, ...] }
 * If fewer entries than calls, remaining calls return [].
 */
export function createSupabaseMock(
  tableDataSeries: Record<string, unknown[]>
): SupabaseMock {
  const callCounts: Record<string, number> = {}
  const allBuilders: Array<{ table: string; builder: MockBuilder }> = []

  return {
    _allBuilders: allBuilders,
    from(table: string) {
      callCounts[table] = (callCounts[table] ?? 0) + 1
      const series = tableDataSeries[table] ?? []
      const idx = callCounts[table] - 1
      const data = idx < series.length ? series[idx] : []
      const builder = createBuilder(data)
      allBuilders.push({ table, builder })
      return builder
    },
  }
}

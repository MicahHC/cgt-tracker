import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type TableName =
  | 'cgt_assets'
  | 'cgt_companies'
  | 'cgt_score_history'
  | 'cgt_change_log'
  | 'cgt_asset_sources'
  | 'cgt_agent_runs'
  | 'cgt_signals'
  | 'research_jobs';

interface Options {
  debounceMs?: number;
  filter?: string;
}

/**
 * Subscribes to Postgres changes on the given Supabase tables and invokes
 * onChange whenever any of them are inserted/updated/deleted. Debounces calls
 * so bursts of agent writes only trigger a single refresh.
 */
export function useRealtimeRefresh(
  tables: TableName[],
  onChange: () => void,
  options: Options = {}
) {
  const { debounceMs = 400, filter } = options;
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handlerRef.current(), debounceMs);
    };

    const channelName = `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);

    for (const table of tables) {
      const config: any = { event: '*', schema: 'public', table };
      if (filter) config.filter = filter;
      channel = channel.on('postgres_changes', config, fire);
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tables.join(','), debounceMs, filter]);
}

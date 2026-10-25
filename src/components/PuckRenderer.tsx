'use client';
import { Render, type Data } from '@measured/puck';
import '@measured/puck/puck.css';
import { useMemo } from 'react';
import { createPuckConfig } from '@/puck/config';
import type { TemplateSummary } from '@/lib/puck';

export function PuckRenderer({ data, templates = [] }: { data: Data; templates?: TemplateSummary[] }) {
  const config = useMemo(() => createPuckConfig(templates), [templates]);
  return <Render config={config} data={data} />;
}

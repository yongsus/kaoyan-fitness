-- 在 Supabase SQL Editor 中执行以下语句创建 active_timers 表

CREATE TABLE IF NOT EXISTS public.active_timers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_start TIMESTAMPTZ,
  total_main_seconds INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'stopped')),
  timer_type TEXT NOT NULL DEFAULT 'schedule' CHECK (timer_type IN ('schedule', 'training')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT DEFAULT ''
);

-- 启用 RLS
ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能读写自己的记录
CREATE POLICY "Users can only access their own active timer"
  ON public.active_timers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 创建 updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION public.update_active_timer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_active_timer_updated_at ON public.active_timers;
CREATE TRIGGER update_active_timer_updated_at
  BEFORE UPDATE ON public.active_timers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_active_timer_updated_at();

-- 启用 Realtime（关键：多端同步依赖此配置）
BEGIN;
  -- 将表加入 publication（Supabase 默认 publication 为 "supabase_realtime"）
  ALTER PUBLICATION supabase_realtime ADD TABLE public.active_timers;
COMMIT;

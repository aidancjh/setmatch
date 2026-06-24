import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AppConfig } from "../types";

const DEFAULT: AppConfig = { maintenanceMode: false, signupsEnabled: true };

/**
 * Public app config (feature flags the client needs). Polls every 30s so a
 * maintenance toggle reaches open apps without a manual refresh.
 */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(DEFAULT);

  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get<AppConfig>("/config")
        .then((c) => active && setConfig(c))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return config;
}

import {
  APP_BASE_NAME,
  getAppDisplayName,
  getAppStageLabel,
} from "@t3tools/shared/branding";

export { APP_BASE_NAME };

export const APP_STAGE_LABEL = getAppStageLabel(import.meta.env.DEV);
export const APP_DISPLAY_NAME = getAppDisplayName(import.meta.env.DEV);

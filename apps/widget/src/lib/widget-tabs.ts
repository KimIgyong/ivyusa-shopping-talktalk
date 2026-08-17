// Imported from source, not through '@ivy/types': the package publishes CJS and
// Rollup cannot trace a named export through its `export *` chain, so a value
// import of the entry point fails the widget build. Same treatment as the
// language registry in `i18n/i18n.ts` — types still come through the package,
// only these runtime values take the source path, which keeps the tab contract
// genuinely shared with the API rather than copied.
export {
  NOTIFICATION_SCOPE,
  WIDGET_TAB,
  WIDGET_TABS_DEFAULT,
  WIDGET_TAB_ORDER,
  WIDGET_TAB_POSITION,
  normalizeWidgetTabs,
} from '../../../../packages/types/src/common/enum.types';

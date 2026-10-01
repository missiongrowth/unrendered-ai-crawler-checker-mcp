import type { ComponentChildren } from "preact";

/** Tabler Icons (MIT, https://tabler.io/icons), outline set, 24 px grid. */
function Icon({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return (
    <svg class={cls === undefined ? "icon" : `icon ${cls}`} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconRefresh = () => (
  <Icon>
    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </Icon>
);

export const IconExternalLink = () => (
  <Icon>
    <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
    <path d="M11 13l9 -9" />
    <path d="M15 4h5v5" />
  </Icon>
);

export const IconChevronRight = () => (
  <Icon class="chevron">
    <path d="M9 6l6 6l-6 6" />
  </Icon>
);

export const IconAlertTriangle = () => (
  <Icon>
    <path d="M12 9v4" />
    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
    <path d="M12 16h.01" />
  </Icon>
);

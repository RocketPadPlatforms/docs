import type React from 'react';

/**
 * Inline stroke icons in the lucide idiom used across rpp.gmbh:
 * 24×24, no fill, currentColor stroke at 1.8, round caps and joins.
 *
 * Hand-inlined rather than pulled from a package: six icons do not justify a
 * dependency, a tree-shaking question and a Renovate PR stream.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** git-branch — GitOps */
export const GitBranchIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="6" x2="6" y1="3" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </Icon>
);

/** cloud — runs anywhere */
export const CloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </Icon>
);

/** ship-wheel — Kubernetes (the helm) */
export const ShipWheelIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v7.5" />
    <path d="m19 5-5.23 5.23" />
    <path d="M22 12h-7.5" />
    <path d="m19 19-5.23-5.23" />
    <path d="M12 14.5V22" />
    <path d="M10.23 13.77 5 19" />
    <path d="M9.5 12H2" />
    <path d="M10.23 10.23 5 5" />
    <circle cx="12" cy="12" r="2.5" />
  </Icon>
);

/** box — containerization */
export const BoxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </Icon>
);

/** rocket — get off the ground quickly */
export const RocketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91 0z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </Icon>
);

/** key-round — single sign-on */
export const KeyRoundIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </Icon>
);

/** arrow-right */
export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

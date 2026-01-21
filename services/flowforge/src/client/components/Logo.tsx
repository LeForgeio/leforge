interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
  variant?: 'full' | 'icon';
}

export function Logo({ className = '', width, height, variant = 'full' }: LogoProps) {
  if (variant === 'icon') {
    // Icon-only variant (just the robot icon)
    return (
      <img
        src="/logo-icon.svg"
        alt="FlowForge"
        className={className}
        width={width}
        height={height}
      />
    );
  }

  // Full horizontal logo (robot + text)
  return (
    <img
      src="/logo.svg"
      alt="FlowForge"
      className={className}
      width={width}
      height={height}
    />
  );
}

import { ReactNode, CSSProperties, useState, useRef } from "react";

export interface GlassProps {
  width?: number | string;
  height?: number | string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  blur?: number;
  borderRadius?: number;
  glassColor?: string;
}

const GlassPanel: React.FC<GlassProps> = ({
  children,
  className = '',
  style = {},
  onClick,
  disabled = false,
  blur = 16,
  borderRadius = 24,
  glassColor = 'rgba(255, 255, 255, 0.1)',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);
    
  return (
    <div
      ref={elementRef}
      className={`liquid-glass-panel ${className}`}
      style={{
        position: 'relative',
        borderRadius: `${borderRadius}px`,
        overflow: 'hidden',
        cursor: onClick && !disabled ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !disabled && onClick?.()}
    >
      {/* Glass backdrop with blur */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: glassColor,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
      }} />
      
      {/* Border */}
      <div style={{
        position: 'absolute',
        inset: '0px',
        borderRadius: `${borderRadius}px`,
        border: `1px solid rgba(255,255,255,${isHovered ? 0.4 : 0.2})`,
        transition: 'border-color 0.3s ease',
        pointerEvents: 'none',
      }} />
      
      {/* Content */}
      {children && (
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%',
          width: '100%',
          padding: '20px',
          pointerEvents: 'auto',
          ...style,
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default GlassPanel;
import GlassPanel, { GlassProps } from "./glass-panel";
import React from "react";

export const GlassButton: React.FC<GlassProps & {
  variant?: 'primary' | 'secondary' | 'ghost';
}> = ({ variant = 'primary', children, ...props }) => {
  const variants = {
    primary: { 
      glassColor: 'rgba(68, 136, 255, 0.1)',
      blur: 20,
    },
    secondary: { 
      glassColor: 'rgba(255, 68, 136, 0.1)',
      blur: 15,
    },
    ghost: { 
      glassColor: 'rgba(255, 255, 255, 0.05)',
      blur: 10,
    },
  };

  return (
    <GlassPanel
      height={60}
      {...variants[variant]}
      {...props}
      style={{
        ...props.style,
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
      }}
    >
      <span style={{
        color: 'white',
        fontSize: '16px',
        fontWeight: '600',
        textShadow: '0 1px 3px rgba(0,0,0,0.3)',
        letterSpacing: '0.5px',
        textAlign: 'center',
        width: '100%',
      }}>
        {children}
      </span>
    </GlassPanel>
  );
};

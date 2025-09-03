import GlassPanel, { GlassProps } from "./glass-panel";

export const GlassCard: React.FC<GlassProps & {
  title?: string;
  description?: string;
}> = ({ title, description, children, ...props }) => {
  return (
    <GlassPanel
      {...props}
      style={{
        ...props.style,
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      }}
    >
      <div style={{
        display: 'flex',             // flex container
        flexDirection: 'column',     // disposizione verticale
        justifyContent: 'center',    // centra verticalmente
        alignItems: 'center',        // centra orizzontalmente
        width: '100%',               // occupa tutta la card
        height: '100%',              // occupa tutta la card
        color: 'white',
        textAlign: 'center',
      }}>
        {title && (
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '28px',
            fontWeight: 'bold',
            textShadow: '0 2px 10px rgba(0,0,0,0.3)',
          }}>
            {title}
          </h3>
        )}
        {description && (
          <p style={{
            margin: '0 0 20px 0',
            fontSize: '16px',
            opacity: 0.95,
            lineHeight: 1.6,
            textShadow: '0 1px 5px rgba(0,0,0,0.3)',
          }}>
            {description}
          </p>
        )}
        {children}
      </div>
    </GlassPanel>
  );
};

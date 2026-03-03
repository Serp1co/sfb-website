import React from "react";
import { GlassCard } from "../glassism/glass-card";

export interface StatsSectionProps {
    number: string;
    label: string;
}

const StatsSection: React.FC<StatsSectionProps> = ({ number, label }) => (
    <GlassCard
        height={150}
        blur={15}
        glassColor="rgba(68, 136, 255, 0.05)"
        className="stats-glass-card"
    >
        <div className="stats-glass-container">
            <div className="stats-glass-panel">
                {number}
            </div>
            <div className="stats-description">
                {label}
            </div>
        </div>
    </GlassCard>
);

export default StatsSection;
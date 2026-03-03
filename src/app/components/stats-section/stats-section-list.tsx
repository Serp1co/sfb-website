import React from "react";
import StatsSection, { StatsSectionProps } from "./stats-section";
import './stats-section.css'

interface StatsSectionListProps {
    stats: StatsSectionProps[];
}

const StatsSectionList: React.FC<StatsSectionListProps> = ({ stats }) => {
    return (
        <div
        style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "20px",
        }}
        >
            {stats.map((stat, i) => (
                <StatsSection
                key={i}
                number={stat.number}
                label={stat.label}
                />
            ))}
        </div>
    );
};

export default StatsSectionList;
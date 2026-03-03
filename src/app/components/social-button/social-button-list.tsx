import React from "react";
import SocialButton, { SocialButtonProps } from "./social-button";
import "./social-button.css"

export interface SocialButtonListProps {
    links: SocialButtonProps[];
}

const SocialButtonList: React.FC<SocialButtonListProps> = ({ links }) => (
    <div className="social-button-list">
        {links.map((social: SocialButtonProps) => (
            <SocialButton
            key={social.name}
            name={social.name}
            link={social.link}
            />
        ))}
    </div>
);

export default SocialButtonList;

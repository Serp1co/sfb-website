import React from "react";
import './social-button.css';

export interface SocialButtonProps {
    name: string;
    link: string;
}
const SocialButton: React.FC<SocialButtonProps> = ({ name, link }) => (

    <a className="social-button"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
    >
        {name}
    </a>
);

export default SocialButton;
import React from "react";
import ContactSection, { ContactSectionProps} from "./contact-section";

export interface ContactSectionListProps {
    contacts: ContactSectionProps[];
}

const ContactSectionList: React.FC<ContactSectionListProps> = ({ contacts }) => (
    <div className="contact-section-list">
        {contacts.map((contact) => (
            <ContactSection
                key={contact.title}
                icon={contact.icon}
                title={contact.title}
                content={contact.content}
            />
        ))}
    </div>
)

export default ContactSectionList;
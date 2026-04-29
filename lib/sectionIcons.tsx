'use client';

/**
 * Curated icon registry for application-schema sections.
 *
 * Instead of typing an emoji, admins pick an icon name here — we render the
 * matching Lucide component wherever the section shows up (settings editor,
 * customer finish page, admin order detail).
 *
 * Storage: the icon name (e.g. "User", "Briefcase") lives on
 * CustomSection.icon (string). Legacy CustomSection.emoji is still honored
 * as a fallback — if both are present, `icon` wins.
 */

import {
  User, Users, FileBadge, Home, MapPin, Briefcase,
  Globe, Plane, Bed, Hotel, Contact, Shield, ShieldAlert,
  FileText, Paperclip, BookOpen, Building2, GraduationCap,
  Heart, Baby, Phone, Mail, CreditCard, DollarSign,
  Sparkles, Star, Flag, AlertTriangle, CheckCircle,
  Package, Tag, Camera, Settings, Gift, Key, Lock,
  Calendar, Clock, MessageSquare, HelpCircle, Smile,
  Stethoscope, Hammer, Car, Train, ShoppingBag, Award,
  Landmark, Fingerprint, Eye, Bot,
  type LucideIcon,
} from 'lucide-react';

export interface IconEntry {
  name: string;
  label: string;
  Icon: LucideIcon;
  /** Grouping for the picker so related icons sit together. */
  group: string;
}

export const SECTION_ICONS: IconEntry[] = [
  // People
  { name: 'User',        label: 'Person',        Icon: User,       group: 'People' },
  { name: 'Users',       label: 'Group',         Icon: Users,      group: 'People' },
  { name: 'Baby',        label: 'Baby',          Icon: Baby,       group: 'People' },
  { name: 'Heart',       label: 'Relationship',  Icon: Heart,      group: 'People' },
  { name: 'Contact',     label: 'Contact',       Icon: Contact,    group: 'People' },
  { name: 'GraduationCap', label: 'Education',   Icon: GraduationCap, group: 'People' },

  // Identity / documents
  { name: 'IdCard',      label: 'ID card',       Icon: FileBadge,  group: 'Identity' },
  { name: 'Fingerprint', label: 'Fingerprint',   Icon: Fingerprint, group: 'Identity' },
  { name: 'BookOpen',    label: 'Passport',      Icon: BookOpen,   group: 'Identity' },
  { name: 'FileText',    label: 'Document',      Icon: FileText,   group: 'Identity' },
  { name: 'Paperclip',   label: 'Attachment',    Icon: Paperclip,  group: 'Identity' },
  { name: 'Camera',      label: 'Photo',         Icon: Camera,     group: 'Identity' },

  // Home & work
  { name: 'Home',        label: 'Home',          Icon: Home,       group: 'Places' },
  { name: 'MapPin',      label: 'Address',       Icon: MapPin,     group: 'Places' },
  { name: 'Briefcase',   label: 'Work',          Icon: Briefcase,  group: 'Places' },
  { name: 'Building2',   label: 'Company',       Icon: Building2,  group: 'Places' },
  { name: 'Landmark',    label: 'Government',    Icon: Landmark,   group: 'Places' },

  // Travel
  { name: 'Plane',       label: 'Plane',         Icon: Plane,      group: 'Travel' },
  { name: 'Bed',         label: 'Bed',           Icon: Bed,        group: 'Travel' },
  { name: 'Hotel',       label: 'Hotel',         Icon: Hotel,      group: 'Travel' },
  { name: 'Car',         label: 'Car',           Icon: Car,        group: 'Travel' },
  { name: 'Train',       label: 'Train',         Icon: Train,      group: 'Travel' },
  { name: 'Globe',       label: 'Globe',         Icon: Globe,      group: 'Travel' },
  { name: 'Flag',        label: 'Flag',          Icon: Flag,       group: 'Travel' },

  // Security & health
  { name: 'Shield',      label: 'Shield',        Icon: Shield,       group: 'Security' },
  { name: 'ShieldAlert', label: 'Warning',       Icon: ShieldAlert,  group: 'Security' },
  { name: 'AlertTriangle', label: 'Alert',       Icon: AlertTriangle, group: 'Security' },
  { name: 'Lock',        label: 'Lock',          Icon: Lock,         group: 'Security' },
  { name: 'Key',         label: 'Key',           Icon: Key,          group: 'Security' },
  { name: 'Eye',         label: 'Review',        Icon: Eye,          group: 'Security' },
  { name: 'Stethoscope', label: 'Medical',       Icon: Stethoscope,  group: 'Security' },

  // Contact
  { name: 'Phone',       label: 'Phone',         Icon: Phone,       group: 'Contact' },
  { name: 'Mail',        label: 'Email',         Icon: Mail,        group: 'Contact' },
  { name: 'MessageSquare', label: 'Message',     Icon: MessageSquare, group: 'Contact' },

  // Money
  { name: 'CreditCard',  label: 'Card',          Icon: CreditCard,  group: 'Money' },
  { name: 'DollarSign',  label: 'Dollar',        Icon: DollarSign,  group: 'Money' },
  { name: 'ShoppingBag', label: 'Purchase',      Icon: ShoppingBag, group: 'Money' },
  { name: 'Gift',        label: 'Gift',          Icon: Gift,        group: 'Money' },

  // Misc
  { name: 'Sparkles',    label: 'Sparkles',      Icon: Sparkles,    group: 'Misc' },
  { name: 'Star',        label: 'Star',          Icon: Star,        group: 'Misc' },
  { name: 'Award',       label: 'Award',         Icon: Award,       group: 'Misc' },
  { name: 'Package',     label: 'Package',       Icon: Package,     group: 'Misc' },
  { name: 'Tag',         label: 'Tag',           Icon: Tag,         group: 'Misc' },
  { name: 'Calendar',    label: 'Calendar',      Icon: Calendar,    group: 'Misc' },
  { name: 'Clock',       label: 'Clock',         Icon: Clock,       group: 'Misc' },
  { name: 'CheckCircle', label: 'Check',         Icon: CheckCircle, group: 'Misc' },
  { name: 'HelpCircle',  label: 'Help',          Icon: HelpCircle,  group: 'Misc' },
  { name: 'Smile',       label: 'Smile',         Icon: Smile,       group: 'Misc' },
  { name: 'Bot',         label: 'Bot',           Icon: Bot,         group: 'Misc' },
  { name: 'Hammer',      label: 'Tools',         Icon: Hammer,      group: 'Misc' },
  { name: 'Settings',    label: 'Gear',          Icon: Settings,    group: 'Misc' },
];

const ICON_BY_NAME = new Map(SECTION_ICONS.map(e => [e.name, e]));

/** Look up an icon entry by its stored name. */
export function getSectionIcon(name?: string | null): IconEntry | null {
  if (!name) return null;
  return ICON_BY_NAME.get(name) ?? null;
}

/**
 * Render a section's icon with a sensible fallback chain:
 *   1. Lucide icon (if `icon` is set and recognised)
 *   2. Legacy emoji (if `emoji` is set)
 *   3. Default Sparkles icon
 */
export function SectionIcon({ icon, emoji, size = 16, strokeWidth = 2 }: {
  icon?: string | null;
  emoji?: string | null;
  size?: number;
  strokeWidth?: number;
}) {
  const entry = getSectionIcon(icon);
  if (entry) {
    const { Icon } = entry;
    return <Icon size={size} strokeWidth={strokeWidth} style={{ display: 'inline-block', verticalAlign: '-0.15em' }} />;
  }
  if (emoji) {
    return <span style={{ fontSize: `${size * 1.05}px`, lineHeight: 1 }}>{emoji}</span>;
  }
  return <Sparkles size={size} strokeWidth={strokeWidth} style={{ display: 'inline-block', verticalAlign: '-0.15em' }} />;
}

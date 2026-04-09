export interface NavSubpage {
  id: string;
  key: string;
  label: string;
  path: string;
  sortOrder: number;
  isActive: boolean;
  minRole: string;
}

export interface NavPage {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  path: string;
  sortOrder: number;
  isActive: boolean;
  minRole: string;
  badgeSource: string | null;
  subpages: NavSubpage[];
}

export interface NavSection {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  minRole: string;
  pages: NavPage[];
}

export interface NavData {
  sections: NavSection[];
}

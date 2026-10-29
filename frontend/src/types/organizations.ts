export type MembershipRole = 'OWNER' | 'ORGANIZER';
export type Organization = {
  id: string; name: string; description: string; createdAt: string; updatedAt: string; membershipRole: MembershipRole;
};
export type OrganizationMember = {
  id: string; name: string; email: string; role: MembershipRole; createdAt: string;
};


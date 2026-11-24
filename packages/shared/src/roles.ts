import type { RoleId, Team } from './types';

export interface RoleInfo {
  name: string;
  team: Team;
  blurb: string;
}

export const ROLES: Record<RoleId, RoleInfo> = {
  mafia: {
    name: 'Mafia',
    team: 'mafia',
    blurb: 'Each night, pick a victim with your team. Blend in by day.',
  },
  doctor: {
    name: 'Doctor',
    team: 'town',
    blurb: 'Each night, protect one player from the Mafia.',
  },
  detective: {
    name: 'Detective',
    team: 'town',
    blurb: 'Each night, check whether one player is Mafia.',
  },
  villager: {
    name: 'Villager',
    team: 'town',
    blurb: 'No night power. Watch, talk, and vote out the Mafia.',
  },
};

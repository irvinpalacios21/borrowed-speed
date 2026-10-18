export interface Team {
  id: string;
  name: string;
  color: string;
}

export const TEAMS: readonly Team[] = [
  { id: "apex-union", name: "Apex Union", color: "#cc5b47" },
  { id: "copperline", name: "Copperline", color: "#b88a22" },
  { id: "blue-harbor", name: "Blue Harbor", color: "#647ec7" },
  { id: "violet-works", name: "Violet Works", color: "#8e6b9c" },
  { id: "ember-racing", name: "Ember Racing", color: "#cc7132" },
  { id: "pinecrest", name: "Pinecrest", color: "#5f917e" },
  { id: "silverline", name: "Silverline", color: "#5b8498" },
  { id: "tideway", name: "Tideway", color: "#147d89" },
];

export interface Driver {
  id: string;
  teamId: string;
  name: string;
  shortName: string;
  number: string;
  seat: 0 | 1;
}

export const DRIVERS: readonly Driver[] = [
  {
    id: "luca-moretti",
    teamId: "apex-union",
    name: "Luca Moretti",
    shortName: "L. Moretti",
    number: "12",
    seat: 0,
  },
  {
    id: "elena-voss",
    teamId: "apex-union",
    name: "Elena Voss",
    shortName: "E. Voss",
    number: "19",
    seat: 1,
  },
  {
    id: "mateo-silva",
    teamId: "copperline",
    name: "Mateo Silva",
    shortName: "M. Silva",
    number: "28",
    seat: 0,
  },
  {
    id: "freya-lind",
    teamId: "copperline",
    name: "Freya Lind",
    shortName: "F. Lind",
    number: "31",
    seat: 1,
  },
  {
    id: "noah-bennett",
    teamId: "blue-harbor",
    name: "Noah Bennett",
    shortName: "N. Bennett",
    number: "04",
    seat: 0,
  },
  {
    id: "hana-park",
    teamId: "blue-harbor",
    name: "Hana Park",
    shortName: "H. Park",
    number: "42",
    seat: 1,
  },
  {
    id: "amara-okafor",
    teamId: "violet-works",
    name: "Amara Okafor",
    shortName: "A. Okafor",
    number: "61",
    seat: 0,
  },
  {
    id: "jules-laurent",
    teamId: "violet-works",
    name: "Jules Laurent",
    shortName: "J. Laurent",
    number: "63",
    seat: 1,
  },
  {
    id: "rafael-costa",
    teamId: "ember-racing",
    name: "Rafael Costa",
    shortName: "R. Costa",
    number: "36",
    seat: 0,
  },
  {
    id: "zoe-hart",
    teamId: "ember-racing",
    name: "Zoe Hart",
    shortName: "Z. Hart",
    number: "38",
    seat: 1,
  },
  {
    id: "finn-anders",
    teamId: "pinecrest",
    name: "Finn Anders",
    shortName: "F. Anders",
    number: "85",
    seat: 0,
  },
  {
    id: "leila-haddad",
    teamId: "pinecrest",
    name: "Leila Haddad",
    shortName: "L. Haddad",
    number: "87",
    seat: 1,
  },
  {
    id: "theo-morgan",
    teamId: "silverline",
    name: "Theo Morgan",
    shortName: "T. Morgan",
    number: "53",
    seat: 0,
  },
  {
    id: "sora-tanaka",
    teamId: "silverline",
    name: "Sora Tanaka",
    shortName: "S. Tanaka",
    number: "57",
    seat: 1,
  },
  {
    id: "alex-rivera",
    teamId: "tideway",
    name: "Alex Rivera",
    shortName: "A. Rivera",
    number: "27",
    seat: 0,
  },
  {
    id: "maya-chen",
    teamId: "tideway",
    name: "Maya Chen",
    shortName: "M. Chen",
    number: "29",
    seat: 1,
  },
];

export const DEFAULT_DRIVER_ID = "alex-rivera";
export const driverById = (id: string) =>
  DRIVERS.find((driver) => driver.id === id)!;
export const teamById = (id: string) => TEAMS.find((team) => team.id === id)!;
export const teammateOf = (driverId: string) => {
  const driver = driverById(driverId);
  return DRIVERS.find(
    (other) => other.teamId === driver.teamId && other.id !== driverId,
  )!;
};

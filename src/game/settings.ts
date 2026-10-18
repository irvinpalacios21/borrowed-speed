export type SettingId = "coastal" | "desert" | "forest" | "night";

export interface RaceSetting {
  name: string;
  ground: string;
  detail: string;
  road: string;
  grain: string;
  wall: string;
  wallEdge: string;
  curb: string;
  curbLight: string;
  marking: string;
  text: string;
}

export const SETTINGS: Record<SettingId, RaceSetting> = {
  coastal: {
    name: "Coastal",
    ground: "#c5ceb6",
    detail: "#adbda6",
    road: "#36464b",
    grain: "#3c4c51",
    wall: "#edf0e6",
    wallEdge: "#70918e",
    curb: "#ce7262",
    curbLight: "#e9eae0",
    marking: "#b5c5c02b",
    text: "#426b66",
  },
  desert: {
    name: "Desert",
    ground: "#d9bd89",
    detail: "#c8a975",
    road: "#504d47",
    grain: "#57534c",
    wall: "#eee0c6",
    wallEdge: "#a69270",
    curb: "#c47655",
    curbLight: "#f5e9cf",
    marking: "#e3d7bd30",
    text: "#786443",
  },
  forest: {
    name: "Forest",
    ground: "#93a68c",
    detail: "#819779",
    road: "#354744",
    grain: "#3b4e49",
    wall: "#e0e9d8",
    wallEdge: "#58755b",
    curb: "#bd7864",
    curbLight: "#e7e8d2",
    marking: "#c3d1b82c",
    text: "#3e604a",
  },
  night: {
    name: "Night",
    ground: "#1d343d",
    detail: "#263e48",
    road: "#293a43",
    grain: "#30434a",
    wall: "#a5bbc0",
    wallEdge: "#4d6d7a",
    curb: "#6385a0",
    curbLight: "#d6e6df",
    marking: "#c4dbe03d",
    text: "#c1d7d3",
  },
};

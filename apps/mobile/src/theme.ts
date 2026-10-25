// Storybook palette from the "Choosing Deck" mockup: parchment pages, maroon ink, gold leaf.
export const colors = {
  bg: "#EDD5AC",
  bgLight: "#F4E2C2",
  tray: "#E4C596",
  card: "#F8E8CC",
  cream: "#FCF3E1",
  page: "#F2CDB2",
  ink: "#4E2522",
  inkSoft: "#7A5246",
  heading: "#8A4A47",
  line: "#7A3B3B",
  lineSoft: "rgba(122,59,59,0.35)",
  bevel: "#B98A5E",
  forest: "#7A3B3B",
  forestSoft: "#E3EBD3",
  gold: "#F6D57E",
  goldDeep: "#E2A93A",
  goldSoft: "#F9E6B0",
  rose: "#C2404A",
  roseSoft: "#F5D3C8",
};

export const fonts = {
  body: "AlegreyaSans_500Medium",
  bold: "AlegreyaSans_700Bold",
  display: "IMFellEnglish_400Regular",
  displayItalic: "IMFellEnglish_400Regular_Italic",
  smallCaps: "IMFellEnglishSC_400Regular",
};

export const serif = fonts.display;

// Hard, offset "paper" shadows. React Native's boxShadow takes CSS syntax.
export const shadows = {
  paper: `0 3px 0 ${colors.bevel}`,
  button: `inset 0 2px 0 rgba(255,250,232,0.7), 0 3px 0 ${colors.bevel}`,
  chosen: `0 0 0 3px ${colors.gold}, 0 0 0 5px ${colors.line}, 0 8px 18px rgba(122,59,59,0.28)`,
};
